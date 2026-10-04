import {test, expect} from '@playwright/test';
import fs from 'node:fs';
test('deployed fixture and retained diagnostics', {annotation:{type:'pipeline-id',description:'deployed-fixture'},tag:['@essential','@full']},async({page},testInfo)=>{
  await page.goto('/');
  await expect(page.locator('#app')).toHaveText('Pipeline Platform isolated E2E fixture');
  await testInfo.attach('deployed-fixture', {body:await page.screenshot(),contentType:'image/png'});
  expect(JSON.parse(fs.readFileSync('acceptance-scenario.json','utf8')).intentionalFailure, 'Controlled failure for artifact acceptance').toBe(false);
});
