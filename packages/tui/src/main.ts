import {runTui} from "./index";
runTui().catch(error=>{process.stderr.write(String(error instanceof Error?error.message:error)+"\n");process.exitCode=1;});
