import { spawnSync } from 'node:child_process';
const run=(args,env={})=>{
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,...env}});
  if(result.status !== 0) process.exit(result.status || 1);
};
run(['qa/demo-form-check.mjs']);
// Separate fixtures: production dist always stays the non-sending product build.
const fixture='tmp/form-live-dist';
run(['node_modules/astro/bin/astro.mjs','build','--outDir',fixture],{
  PUBLIC_LEAD_MODE:'live',PUBLIC_LEAD_ENDPOINT:'',PUBLIC_LEAD_PROJECT_ID:'qa-project',PUBLIC_LEAD_FORM_ID:'qa-form',
});
run(['qa/lead-form-check.mjs'],{QA_DIST:fixture});
run(['qa/runtime-form-check.mjs'],{QA_DIST:fixture});
run(['node_modules/astro/bin/astro.mjs','build','--outDir','tmp/form-invalid-dist'],{
  PUBLIC_LEAD_MODE:'live',PUBLIC_LEAD_ENDPOINT:'',PUBLIC_LEAD_PROJECT_ID:'',PUBLIC_LEAD_FORM_ID:'',
});
run(['qa/demo-form-check.mjs'],{QA_DIST:'tmp/form-invalid-dist',QA_CONFIG_INVALID:'1'});
