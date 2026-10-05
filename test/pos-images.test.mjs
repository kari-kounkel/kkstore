import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM(fs.readFileSync(new URL('../pos/index.html',import.meta.url),'utf8'),{url:'http://localhost/pos',runScripts:'outside-only'});
const catalog=[
{id:'mustard',title:'My Brain Is Mustard',slug:'my-brain-is-mustard',categories:['books'],image_url:null,images:[]},
{id:'ladybug',title:'Ladybug Ladybug',slug:'ladybug-ladybug',categories:['books'],image_url:null,images:[]},
{id:'craft',title:'Craft kit',categories:['crafts'],image_url:'https://example.test/kit.jpg',images:[]}];
const items=[
{id:'hardback',product_id:'mustard',label:'My Brain Is Mustard — Hardback',price:25,stock_qty:3},
{id:'softcover',product_id:'mustard',label:'My Brain Is Mustard — Softcover',price:20,stock_qty:0},
{id:'ladybug-item',product_id:'ladybug',label:'Ladybug Ladybug',price:18,stock_qty:10},
{id:'craft-item',product_id:'craft',label:'Craft kit',price:5,stock_qty:null},
{id:'custom-item',product_id:null,label:'Event special',price:4,stock_qty:2}];
dom.window.fetch=async(url,opts)=>{const action=JSON.parse(opts.body).action;assert(['catalog','bootstrap'].includes(action));return {ok:true,json:async()=>action==='catalog'?({products:catalog}):({event:{id:'demo',name:'Test fixture',tax_rate:0},items,reader_configured:false})};};
for(const script of dom.window.document.querySelectorAll('script:not([src])'))dom.window.eval(script.textContent);
dom.window.document.getElementById('code').value='fixture-only';dom.window.document.getElementById('unlock').click();
await new Promise(r=>setTimeout(r,20));
assert.equal(dom.window.document.querySelectorAll('.tile').length,5,'formats grouped plus other items/custom');
assert.equal(dom.window.document.querySelectorAll('.category').length,4,'All Books Crafts General');
const mustard=[...dom.window.document.querySelectorAll('.tile')].find(b=>b.textContent.includes('My Brain Is Mustard'));
mustard.click();
const options=dom.window.document.querySelectorAll('.format-option');
assert.equal(options.length,2);assert.match(options[0].textContent,/Hardback/);assert.equal(options[1].disabled,true,'sold-out softcover disabled');
options[0].click();assert.match(dom.window.document.querySelector('.line-name').textContent,/Hardback/);assert.match(dom.window.document.querySelector('.line-each').textContent,/25.00/);
const crafts=[...dom.window.document.querySelectorAll('.category')].find(b=>b.textContent==='Crafts');crafts.click();
assert.equal(dom.window.document.querySelectorAll('.tile').length,2,'crafts and custom');
assert.equal(dom.window.document.querySelectorAll('.line').length,1,'category switching preserves cart');
const books=[...dom.window.document.querySelectorAll('.category')].find(b=>b.textContent==='Books');books.click();
assert.equal(dom.window.document.querySelector('.tile-cover').getAttribute('src'),'http://localhost/pos/covers/ladybug.jpg');
const node=dom.window.document.querySelector('.tile-cover');node.dispatchEvent(new dom.window.Event('error'));assert(dom.window.document.querySelector('.tile-placeholder'));
dom.window.close();
console.log('PASS: compact image tiles, categories, format pricing picker, format-level sold-out/stock/cart identity, category cart preservation and missing-image fallback. No real API or payment calls.');
