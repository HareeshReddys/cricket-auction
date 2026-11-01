import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { cricHeroesProfile } from '../backend/src/cricheroes.ts';

test('profile URL validation agrees in the API and auction, rejecting phone numbers and unsafe destinations',async()=>{
 const source=await fs.readFile(new URL('../dashboard/public/auction-runtime.js',import.meta.url),'utf8');
 const context=vm.createContext({URL});
 vm.runInContext(source.slice(source.indexOf('function cricHeroesURL('),source.indexOf('function cricHeroesMarkup(')),context);
 for(const input of ['https://cricheroes.com/player-profile/9558182/cricheroes-user/stats','https://www.cricheroes.in/player-profile/9558182/cricheroes-user?tracking=1']){
  assert.equal(cricHeroesProfile(input),'https://cricheroes.com/player-profile/9558182/cricheroes-user/stats');
  assert.equal(context.cricHeroesURL(input),cricHeroesProfile(input));
 }
 for(const input of ['9876543210','9558182','javascript:alert(1)','https://cricheroes.com.evil.test/player-profile/1/test','https://evil.test/?url=https://cricheroes.com/player-profile/1/test','https://user:pass@cricheroes.com/player-profile/1/test','http://cricheroes.com/player-profile/1/test','https://cricheroes.com/player-profile/1/test/extra']){
  assert.throws(()=>cricHeroesProfile(input));assert.equal(context.cricHeroesURL(input),'');
 }
 assert.equal(cricHeroesProfile(''),'');
});
