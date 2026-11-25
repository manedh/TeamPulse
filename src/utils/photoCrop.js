export function cropRectangle(width,height,zoom=1,x=50,y=50){
 const scale=Math.min(3,Math.max(1,Number(zoom)||1)),size=Math.min(width,height)/scale;
 return {sx:(width-size)*Math.min(100,Math.max(0,Number(x)||0))/100,sy:(height-size)*Math.min(100,Math.max(0,Number(y)||0))/100,size};
}
export function drawPhotoCrop(canvas,image,zoom,x,y){const {sx,sy,size}=cropRectangle(image.naturalWidth||image.width,image.naturalHeight||image.height,zoom,x,y),ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,sx,sy,size,size,0,0,canvas.width,canvas.height);}
