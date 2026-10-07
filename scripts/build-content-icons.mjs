// Generate simple Kanban launcher artwork without additional dependencies.
import {deflateSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
const crc32 = data => {
  let crc = 0xffffffff;
  for(const byte of data){crc ^= byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
};
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc]);}
const inside=(x,y,left,top,width,height,radius)=>{
  if(x<left||x>=left+width||y<top||y>=top+height)return false;
  const cx=Math.max(left+radius,Math.min(x,left+width-radius)),cy=Math.max(top+radius,Math.min(y,top+height-radius));
  return (x-cx)**2+(y-cy)**2<=radius**2;
};
const cards=[[138,178],[138,234],[234,178],[330,178],[330,234],[330,290]];
function pixel(x,y){let color=[17,23,29];if([128,224,320].some(left=>inside(x,y,left,144,64,224,12)))color=[155,216,187];if(cards.some(([left,top])=>inside(x,y,left,top,44,42,6)))color=[37,60,52];return color;}
for(const size of [192,512]){
  const rows=Buffer.alloc(size*(size*3+1));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const color=[0,0,0];
    for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){const sample=pixel((x+(sx+.5)/2)*512/size,(y+(sy+.5)/2)*512/size);for(let c=0;c<3;c++)color[c]+=sample[c]/4;}
    const offset=y*(size*3+1)+1+x*3;for(let c=0;c<3;c++)rows[offset+c]=Math.round(color[c]);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
  await writeFile(`content-calendar/icon-${size}.png`,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));
}
console.log('Built Content Board launcher icons');
