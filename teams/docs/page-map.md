# Page map

| System | Entry | Main content |
| --- | --- | --- |
| Teams | Workspace | To-dos, delivery progress, usage and operations |
| Teams | Project list | Find, create and open projects |
| Teams | Project overview | Requirement/issue metrics, to-dos, project material, knowledge and Skill summary |
| Teams | Task management | Requirements, issues, general tasks; assignment, source and delivery entry |
| Teams | Task delivery | All actual tasks share clarification, development, verification and acceptance; node input / result (deliverables and criteria) / execution process (CLI progress and the session conversation: user input and model-visible replies) plus always-visible task material; automatic knowledge import and data collection after acceptance |
| Teams | Project settings | Members and configuration |
| Teams | Personal settings | Current role and permissions, Owner workspace reset |
| Teams | Team | Members and collaboration |
| Teams | Resource marketplace / subscriptions / publishing | Discover, adopt and share capabilities |
| Teams | Agent management | Local tools and configuration |
| Teams | Enterprise connections | Service connections, external material |
| Teams | Team work / traceability | Execution activity and delivery records |
| Talent | Project knowledge | Overview, documents, graph, build records |
| Talent | Trajectory analysis | Single-requirement / multi-requirement analysis |
| Talent | Capability evolution | Candidates, evaluation, publishing and adoption |

The Owner manages requirement assignment, acceptance and capability publishing, and can also be a task assignee. Project members can browse "My tasks" and "Other tasks" in the project; starting iCode, adopting input and syncing progress are allowed only for the task's current assignee. Talent returns knowledge and Skills for the current project, task and node; the page and the CLI share the same result, and new suggestions are never presented as historical adoptions. There is no separate demo navigation. Switching projects must not bring another project's data into the current record.

General tasks are for work such as environment preparation, technical optimization and documentation. The Owner can create and assign them, and the current assignee can start them and fill in a completion note. They do not count toward the number of requirements or issues and do not produce requirement acceptance, test or release evidence. Tasks imported from iCode Teams use the same four-node UI; their original stages are mapped while keeping the source node and evidence. Stages without a matching record show "Not provided" and produce no local adoption, CLI progress or acceptance record. The Credit Card project ID is still `carddemo`, and the requirement and session scope are unchanged.
