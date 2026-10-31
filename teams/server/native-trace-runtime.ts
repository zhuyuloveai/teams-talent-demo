import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {nativeSkillEnvironment} from './native-skill-reader.js';
import {root} from './config.js';
const execute=promisify(execFile);
/** Verify the real selected runtime, not another Python on PATH. Does not install anything. */
export async function nativeTraceRuntime(){
 const native=await nativeSkillEnvironment(),script=join(root,'scripts/native/check-trace-runtime.py');
 const check=JSON.parse((await execute(native.python,['-I',script],{timeout:15000,maxBuffer:65536,windowsHide:true})).stdout);
 if(check.ready!==true)throw new Error(`The current iCode is missing a matching OTLP HTTP dependency (SDK ${check.sdkVersion??'not installed'}). Follow the quick start guide to install the same exporter version for this iCode Python; tracing was not turned off and no other runtime was used.`);
 return {python:native.python,configDirectory:native.configDirectory,script,nativeVersion:native.version,sdkVersion:String(check.sdkVersion),exporterVersion:String(check.exporterVersion)};
}
