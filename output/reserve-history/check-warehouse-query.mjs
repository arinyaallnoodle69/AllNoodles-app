import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import ts from 'typescript';
nextEnv.loadEnvConfig(process.cwd());
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const groups=await admin.from('fresh_reserve_stock_groups').select('id,organization_id');
assert.ifError(groups.error);
const require=createRequire(import.meta.url);
const compiled=ts.transpileModule(readFileSync('src/app/orders/fresh-reserve-stock/history-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
for(const group of groups.data){
 const mod={exports:{}};
 new Function('require','module','exports',compiled)(name=>name==='@/lib/auth/authorization'?{requireAnyRole:async()=>({organizationId:group.organization_id})}:name==='@/lib/supabase/admin'?{getSupabaseAdmin:()=>admin}:require(name),mod,mod.exports);
 const result=await mod.exports.fetchReserveWarehouseHistory({groupId:group.id,from:'2026-10-10',to:'2026-10-16'});
 assert.ok(result.items.length<=50);assert.ok(result.total>=result.items.length);assert.ok(result.items.every(item=>item.productName));
 const last=result.items.at(-1);
 if(last){const older=await mod.exports.fetchReserveWarehouseHistory({groupId:group.id,from:'2026-10-10',to:'2026-10-16',asOf:result.asOf,cursor:{at:last.created_at,id:last.id}});assert.equal(older.total,result.total);assert.ok(older.items.every(item=>!result.items.some(previous=>previous.id===item.id)));}
 process.stdout.write(`Verified warehouse: ${result.items.length} rows, ${result.total} total; read-only.\n`);
}

