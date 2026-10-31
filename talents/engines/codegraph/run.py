#!/usr/bin/env python3
"""iCode Knowledge codegraph build/update wrapper (Python 3.9+ standard library only).

Usage: run.py --input-file <absolute path to the iCode Knowledge execution JSON>
       run.py --check   (the engine self-check: environment and `codegraph --version`)

The input names either one repository or one member of a repository set (iCode Knowledge runs a set task
once per member); either way exactly one repository is indexed, in <repo>/.codegraph:
  database missing and .codegraph absent or empty  -> codegraph init <repo> --yes
  database present and status complete             -> codegraph sync <repo>
  anything else                                    -> fail; never index, uninit, unlock or delete
The script exits 0 only after `codegraph status --json` confirms a complete index for this
repository with no pending references. The repository's `git` (main branch, the commit iCode Knowledge synced
it to, and the previous build's commit) is only logged: codegraph sync finds what changed by itself.
"""

import json
import os
import shutil
import stat
import subprocess
import sys

PREFIX = '[icode-knowledge-codegraph]'
STATUS_LIMIT = 1024 * 1024
GIT_REDIRECTS = ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
                 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE')
RECOVERY_HINT = ('First stop the builds, syncs and MCP processes that use this repository (including a codegraph MCP in iCode that has it open), '
                 'then restore the index by hand outside iCode Knowledge (for example, run codegraph index in the repository root); '
                 'iCode Knowledge never rebuilds, unlocks or deletes index files by itself.')
# codegraph index cannot start without codegraph.db, so the only way back is a fresh build.
MISSING_DB_HINT = ('codegraph index cannot recover without codegraph.db. First stop the builds, syncs and MCP processes that use this repository '
                   '(including a codegraph MCP in iCode that has it open), then delete the whole .codegraph/ directory (its configuration is deleted too; back it up first if needed), '
                   'and build again with iCode Knowledge; iCode Knowledge never deletes index files by itself.')


class Failure(Exception):
    pass


WINDOWS = sys.platform == 'win32'
# The arguments codegraph's own bin\codegraph.cmd (v1.6.0) passes to the bundled node.exe.
WINDOWS_NODE_FLAGS = ['--liftoff-only', '--disable-warning=ExperimentalWarning']


def codegraph_command():
    """argv prefix that starts codegraph. Windows cannot start the bundle's .cmd launcher without
    cmd.exe, which would expand '%' in repository paths, so the bundled node.exe runs the entry
    directly, as codegraph's own npm shim does on Windows."""
    found = shutil.which('codegraph')
    if found is None:
        raise Failure('codegraph not found in the PATH of the iCode Knowledge backend. Install it as described in the README and try again.')
    if not WINDOWS:
        return ['codegraph']
    if found.lower().endswith('.exe'):
        return [found]
    root = os.path.dirname(os.path.dirname(found))
    node = os.path.join(root, 'node.exe')
    entry = os.path.join(root, 'lib', 'dist', 'bin', 'codegraph.js')
    if not found.lower().endswith('.cmd') or not os.path.isfile(node) or not os.path.isfile(entry):
        raise Failure('The codegraph in PATH is %s, not the codegraph package installed by install.ps1 (expected %s and %s). '
                      'On Windows only codegraph installed by install.ps1 is supported, not a global npm install; install it as described in the README and try again.' % (found, node, entry))
    return [node] + WINDOWS_NODE_FLAGS + [entry]


def same_path(left, right):
    """Path equality for codegraph's reported paths; Windows paths compare without case."""
    return isinstance(left, str) and os.path.normcase(left) == os.path.normcase(right)


def say(message):
    print('%s %s' % (PREFIX, message), flush=True)


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key: %s' % key)
        result[key] = value
    return result


def reject_constant(name):
    raise ValueError('non-finite number %s is not allowed' % name)


def strict_json(text, what):
    try:
        return json.loads(text, object_pairs_hook=no_duplicates, parse_constant=reject_constant)
    except ValueError as error:
        raise Failure('%s is not valid JSON: %s' % (what, error))


def read_input(argv):
    if len(argv) != 2 or argv[0] != '--input-file' or not os.path.isabs(argv[1]):
        raise Failure('Usage: run.py --input-file <absolute path>')
    try:
        with open(argv[1], 'rb') as handle:
            raw = handle.read()
        document = strict_json(raw.decode('utf-8'), 'input file')
    except (OSError, UnicodeDecodeError) as error:
        raise Failure('Cannot read input file %s: %s' % (argv[1], error))
    if not isinstance(document, dict) or set(document) != {'input', 'output'}:
        raise Failure('The input file must contain only input and output')
    data, output = document['input'], document['output']
    if not isinstance(data, dict) or set(data) not in ({'repositories'}, {'repositorySet'}):
        raise Failure('input must contain exactly one of repositories or repositorySet')
    member = None
    git = None
    if 'repositories' in data:
        repositories = data['repositories']
        if not isinstance(repositories, list) or len(repositories) != 1:
            raise Failure('Each codegraph run must have exactly one repository')
        repository = repositories[0]
        if not isinstance(repository, dict) or set(repository) - {'git'} != {'sourceId', 'path'} or not isinstance(repository['path'], str):
            raise Failure('A repository entry must contain sourceId and path, and may contain git')
        repo = repository['path']
        git = read_git(repository.get('git'), 'the repository entry git')
    else:
        member = read_member(data['repositorySet'])
        repo = member['path']
        git = member['git']
    if not isinstance(output, dict) or set(output) != {'index'} or not isinstance(output['index'], dict) \
            or set(output['index']) != {'path'} or not isinstance(output['index']['path'], str):
        raise Failure('output must contain only index.path')
    return repo, output['index']['path'], member, git


def positive(value):
    return type(value) is int and value > 0


def read_git(value, label):
    """The code version iCode Knowledge synced the repository to: {branch, sync, commit, previous}, previous
    being null or {branch, commit, available, operation, executionId, recordedAt}. None when absent."""
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {'branch', 'sync', 'commit', 'previous'} \
            or not isinstance(value['branch'], str) or value['sync'] not in ('pull', 'local') or not isinstance(value['commit'], str):
        raise Failure('%s must contain branch, sync, commit and previous' % label)
    previous = value['previous']
    if previous is not None and (not isinstance(previous, dict) or not isinstance(previous.get('commit'), str)):
        raise Failure('%s.previous must be null or an object containing commit' % label)
    return value


def read_member(repository_set):
    """The member this execution processes, after checking it against the set: <set>/<name>, listed
    in members at its position. Returns the member with the set root added."""
    if not isinstance(repository_set, dict) or set(repository_set) != {'sourceId', 'path', 'members', 'member'} \
            or not isinstance(repository_set['path'], str):
        raise Failure('repositorySet must contain only sourceId, path, members and member')
    members = repository_set['members']
    if not isinstance(members, list) or not members or any(
            not isinstance(item, dict) or set(item) != {'name', 'path'} or not isinstance(item['name'], str) or not isinstance(item['path'], str)
            for item in members):
        raise Failure('repositorySet.members must be a non-empty list of name and path')
    member = repository_set['member']
    if not isinstance(member, dict) or set(member) - {'git'} != {'name', 'path', 'index', 'total'} \
            or not isinstance(member['name'], str) or not isinstance(member['path'], str) \
            or not positive(member['index']) or not positive(member['total']):
        raise Failure('repositorySet.member must contain name, path, index and total, and may contain git')
    member = dict(member, git=read_git(member.get('git'), 'repositorySet.member.git'))
    if member['total'] != len(members) or member['index'] > member['total'] \
            or members[member['index'] - 1] != {'name': member['name'], 'path': member['path']}:
        raise Failure('repositorySet.member does not match member repository %r in members' % member['index'])
    if member['path'] != os.path.join(repository_set['path'], member['name']):
        raise Failure('Member repository %s has path %s, which is not under the set root %s' % (member['name'], member['path'], repository_set['path']))
    return dict(member, root=repository_set['path'])


def check_environment():
    if 'CODEGRAPH_DIR' in os.environ:
        raise Failure('Environment variable CODEGRAPH_DIR is set (value: %r). The first version only uses the default .codegraph directory in the repository; '
                      'unset it in the environment that starts the iCode Knowledge backend and try again. No codegraph command was run.' % os.environ['CODEGRAPH_DIR'])
    present = [name for name in GIT_REDIRECTS if name in os.environ]
    if present:
        raise Failure('Environment variables that make git read another repository are set: %s. Unset them in the environment that starts the iCode Knowledge backend and try again; '
                      'the script never removes or rewrites them. No codegraph command was run.' % ', '.join(present))


def check_repository(repo, index):
    if not os.path.isabs(repo) or os.path.realpath(repo) != repo:
        raise Failure('The repository path is not a canonical absolute path: %s' % repo)
    try:
        info = os.lstat(repo)
    except OSError as error:
        raise Failure('Cannot access repository %s: %s' % (repo, error))
    if not stat.S_ISDIR(info.st_mode):
        raise Failure('The repository path is not a directory: %s' % repo)
    expected = os.path.join(repo, '.codegraph')
    if index != expected:
        raise Failure('The artifact path %s does not match the index directory %s of this repository' % (index, expected))


def index_state(index):
    """'init' when the database is missing and the directory is absent or empty; 'existing' otherwise."""
    try:
        info = os.lstat(index)
    except FileNotFoundError:
        return 'init'
    except OSError as error:
        raise Failure('Cannot read index directory %s: %s' % (index, error))
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise Failure('The index location %s is not a plain directory (it may be a file or a symlink); it is left as is. %s' % (index, RECOVERY_HINT))
    database = os.path.join(index, 'codegraph.db')
    try:
        db_info = os.lstat(database)
    except FileNotFoundError:
        try:
            entries = sorted(os.listdir(index))
        except OSError as error:
            raise Failure('Cannot read index directory %s: %s; it is not treated as empty.' % (index, error))
        if entries:
            shown = ', '.join(entries[:10]) + (' …' if len(entries) > 10 else '')
            raise Failure('Index directory %s is not empty but has no codegraph.db (found: %s); nothing is initialized or deleted. %s' % (index, shown, MISSING_DB_HINT))
        return 'init'
    except OSError as error:
        raise Failure('Cannot read index database %s: %s' % (database, error))
    if not stat.S_ISREG(db_info.st_mode):
        raise Failure('Index database %s is not a regular file; %s' % (database, RECOVERY_HINT))
    return 'existing'


def run_native(command, args, repo):
    """init/sync: output goes straight to the platform log; non-zero fails immediately."""
    say('Running: codegraph %s' % ' '.join(args))
    try:
        completed = subprocess.run(command + args, cwd=repo, stdin=subprocess.DEVNULL, shell=False)
    except OSError as error:
        raise Failure('Cannot start codegraph: %s' % error)
    if completed.returncode != 0:
        raise Failure('codegraph %s failed with exit code %d; not retrying, rebuilding or running index.' % (args[0], completed.returncode))


def read_status(command, repo):
    """Runs status --json; stdout is captured (max 1 MiB, then drained), stderr is forwarded."""
    try:
        process = subprocess.Popen(command + ['status', repo, '--json'], cwd=repo, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, shell=False)
    except OSError as error:
        raise Failure('Cannot start codegraph status: %s' % error)
    captured = bytearray()
    overflow = False
    while True:
        chunk = process.stdout.read(65536)
        if not chunk:
            break
        if len(captured) + len(chunk) > STATUS_LIMIT:
            overflow = True
        else:
            captured.extend(chunk)
    code = process.wait()
    if code != 0:
        raise Failure('codegraph status failed with exit code %d (the database may not open, be locked or be corrupt); %s' % (code, RECOVERY_HINT))
    if overflow:
        raise Failure('codegraph status output exceeds 1 MiB, which breaks the status contract.')
    try:
        text = captured.decode('utf-8')
    except UnicodeDecodeError as error:
        raise Failure('codegraph status output is not valid UTF-8: %s' % error)
    value = strict_json(text, 'codegraph status output')
    if not isinstance(value, dict):
        raise Failure('codegraph status output must be a JSON object')
    return value


def count(value, name):
    if type(value) is not int or value < 0:
        raise Failure('status field %s must be a non-negative integer, got %r' % (name, value))
    return value


def check_identity(status, repo, index):
    if status.get('initialized') is not True:
        raise Failure('status shows this repository is not initialized (initialized=%r)' % status.get('initialized'))
    if not same_path(status.get('projectPath'), repo):
        raise Failure('status projectPath %r does not match this repository %s (it may have hit a parent repository index)' % (status.get('projectPath'), repo))
    if not same_path(status.get('indexPath'), index):
        raise Failure('status indexPath %r does not match the artifact path %s' % (status.get('indexPath'), index))
    details = status.get('index')
    if not isinstance(details, dict):
        raise Failure('status has no index object')
    return details


def verify(status, repo, index, synced):
    details = check_identity(status, repo, index)
    if details.get('state') != 'complete':
        raise Failure('Index state is %r, not complete. %s' % (details.get('state'), RECOVERY_HINT))
    pending_refs = count(details.get('pendingRefs'), 'index.pendingRefs')
    changes = status.get('pendingChanges')
    if not isinstance(changes, dict):
        raise Failure('status has no pendingChanges object')
    added, modified, removed = (count(changes.get(key), 'pendingChanges.' + key) for key in ('added', 'modified', 'removed'))
    reindex = details.get('reindexRecommended')
    if type(reindex) is not bool:
        raise Failure('status field index.reindexRecommended must be a boolean, got %r' % (reindex,))
    if pending_refs != 0:
        raise Failure('%d references are still unresolved (pendingRefs), so the index is incomplete; not syncing again or rebuilding.' % pending_refs)
    if added or modified or removed:
        say('Note: changes are still waiting to sync (%d added, %d modified, %d deleted).' % (added, modified, removed))
        if synced:
            say('Some changes may not be synced yet: another sync may be running, or new changes arrived during this run. Update again later.')
    if reindex:
        say('Note: codegraph recommends a reindex (reindexRecommended=true); this run still counts as a success and nothing is rebuilt.')
    if status.get('fileCount') == 0:
        say('Note: the index has no files. This may be a valid empty index, depending on the languages and collection rules codegraph supports.')


def self_check():
    """The engine self-check iCode Knowledge runs before every build and update: the same environment checks
    and the same codegraph lookup as a build, then `codegraph --version`."""
    try:
        check_environment()
        command = codegraph_command()
        try:
            result = subprocess.run(command + ['--version'], stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise Failure('Cannot run codegraph --version: %s' % error)
        if result.returncode != 0:
            raise Failure('codegraph --version ended with exit code %d: %s' % (result.returncode, (result.stderr or result.stdout).strip()))
        say('Self-check passed: codegraph %s (%s)' % (result.stdout.strip(), ' '.join(command)))
        return 0
    except Failure as failure:
        print('%s Self-check failed: %s' % (PREFIX, failure), file=sys.stderr, flush=True)
        return 1


def main(argv):
    if argv == ['--check']:
        return self_check()
    try:
        repo, index, member, git = read_input(argv)
        if member is not None:
            say('Member repository %s (%d of %d), set root %s' % (member['name'], member['index'], member['total'], member['root']))
        if git is not None:
            previous = git['previous']
            say('Code version: branch %s, commit %s; last successful build or update: %s' % (git['branch'], git['commit'][:12], previous['commit'][:12] if previous else 'none'))
        check_environment()
        check_repository(repo, index)
        command = codegraph_command()
        state = index_state(index)
        synced = False
        if state == 'init':
            if os.environ.get('CODEGRAPH_NO_WATCH') == '1':
                raise Failure('CODEGRAPH_NO_WATCH=1 makes init fall back to installing Git hooks; the first version does not initialize in that case. Unset it in the environment that starts the iCode Knowledge backend and try again.')
            run_native(command, ['init', repo, '--yes'], repo)
        else:
            details = check_identity(read_status(command, repo), repo, index)
            if details.get('state') != 'complete':
                raise Failure('The existing index state is %r; not rebuilding or running index. %s' % (details.get('state'), RECOVERY_HINT))
            run_native(command, ['sync', repo], repo)
            synced = True
        if index_state(index) != 'existing':
            raise Failure('codegraph exited 0, but there is no codegraph.db in %s.' % index)
        verify(read_status(command, repo), repo, index, synced)
        say('Done: the index of %s passed verification (%s).' % (repo, 'sync' if synced else 'init'))
        return 0
    except Failure as failure:
        print('%s Failed: %s' % (PREFIX, failure), file=sys.stderr, flush=True)
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
