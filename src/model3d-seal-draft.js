// Lower a radial height field to a tapered envelope. Each surface sample is a
// source in a shortest-path transform; edge costs are physical surface distance
// times cot(angle). This keeps the footprint and blank bands unchanged, while
// bounding radial rise along Z for a cylinder printed upright. Circumferential
// neighbors wrap across the seam; axial neighbors use the real margin spacing.
export function draftSealHeights(input,columns,levels,arcPitch,angle){
  if(!angle)return input;
  const heights=Float64Array.from(input),count=heights.length,heap=new Int32Array(count),positions=new Int32Array(count);
  const slope=1/Math.tan(angle*Math.PI/180),variable=typeof arcPitch!=='number',horizontal=variable?Float64Array.from(arcPitch,value=>value*slope):arcPitch*slope;
  const vertical=new Float64Array(levels.length-1),diagonal=new Float64Array(levels.length-1);
  for(let j=0;j<vertical.length;j++){const dz=levels[j+1]-levels[j];vertical[j]=dz*slope;if(!variable)diagonal[j]=Math.hypot(arcPitch,dz)*slope;}
  for(let i=0;i<count;i++)heap[i]=positions[i]=i;
  const swap=(a,b)=>{const value=heap[a];heap[a]=heap[b];heap[b]=value;positions[heap[a]]=a;positions[value]=b;};
  let size=count;
  function down(start){
    let parent=start;
    while(parent*2+1<size){let child=parent*2+1;if(child+1<size&&heights[heap[child+1]]<heights[heap[child]])child++;if(heights[heap[parent]]<=heights[heap[child]])break;swap(parent,child);parent=child;}
  }
  for(let i=Math.floor(count/2)-1;i>=0;i--)down(i);
  function relax(index,value){
    let position=positions[index];if(position<0||value>=heights[index])return;
    heights[index]=value;
    while(position>0){const parent=(position-1)>>1;if(heights[heap[parent]]<=value)break;swap(parent,position);position=parent;}
  }
  while(size){
    const index=heap[0],height=heights[index];positions[index]=-1;
    if(--size){heap[0]=heap[size];positions[heap[0]]=0;down(0);}
    const row=Math.floor(index/columns),column=index%columns,base=row*columns,left=column?column-1:columns-1,right=column+1===columns?0:column+1;
    const leftCost=variable?horizontal[left]:horizontal,rightCost=variable?horizontal[column]:horizontal;
    relax(base+left,height+leftCost);relax(base+right,height+rightCost);
    if(row){const prior=base-columns,dz=vertical[row-1];relax(prior+column,height+dz);relax(prior+left,height+(variable?Math.hypot(leftCost,dz):diagonal[row-1]));relax(prior+right,height+(variable?Math.hypot(rightCost,dz):diagonal[row-1]));}
    if(row+1<levels.length){const next=base+columns,dz=vertical[row];relax(next+column,height+dz);relax(next+left,height+(variable?Math.hypot(leftCost,dz):diagonal[row]));relax(next+right,height+(variable?Math.hypot(rightCost,dz):diagonal[row]));}
  }
  return heights;
}
