import * as THREE from "/static/vendor/three/three.module.js";
import { OrbitControls } from "/static/vendor/three/OrbitControls.js";
let activeSource = "telegram";
let loaded = false;
let disposeTopicSpace = () => {};
let selectTopicOnMap = () => {};
let selectedRecordsRequest = null;
let recordsOffset = 0;
let webglAvailable;
let activeMapMode = "3d";
let currentTopicPoints = [];
let currentTopicData = null;
let sourceHeatmapMode = "corpus";
let topicTimelineMode = "frequency";
let activeMapOverlay = "all";
let activeMobilityTheme = null;
let activeMapFamily = null;
let selectedMapTopicId = null;
let topicMapViewState = { three: null, two: null };
let topicChunkTooltip = null;
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const mobilityThemes = {
  refugees_displacement: {label: "Refugees and displacement", color: "#1D9E75"},
  immigration_documents: {label: "Immigration, borders and documents", color: "#378ADD"},
  returns_deportations: {label: "Returns and deportations", color: "#EF9F27"},
  trafficking_smuggling: {label: "Trafficking and smuggling", color: "#7F77DD"},
  migrant_journeys: {label: "Migrant journeys", color: "#8B6F47"},
  diaspora: {label: "Diaspora", color: "#D85A30"},
};
const topicMobilityTags = topic => topic.mobility_tags || [];
const hasMobilityTag = topic => topicMobilityTags(topic).length > 0;
function showTopicChunkTooltip(chunk) {
  if (!topicChunkTooltip) {
    topicChunkTooltip=document.createElement("div");
    topicChunkTooltip.className="fsv2-topic-chunk-tooltip";
    topicChunkTooltip.hidden=true;
    document.getElementById("fsv2-bertopic-records-dialog")?.append(topicChunkTooltip);
    document.addEventListener("pointerdown",event=>{if(!topicChunkTooltip.hidden&&!event.target.closest(".fsv2-topic-chunk"))topicChunkTooltip.hidden=true;});
  }
  const rect=chunk.getBoundingClientRect();
  topicChunkTooltip.textContent=`Assigned topic: ${chunk.dataset.topicLabel}`;
  topicChunkTooltip.style.left=`${Math.min(rect.left,window.innerWidth-260)}px`;
  topicChunkTooltip.style.top=`${Math.min(rect.bottom+7,window.innerHeight-44)}px`;
  topicChunkTooltip.hidden=false;
}
const mapGroup = topic => ({id: `neighborhood-${topic.family_id}`, label: topic.family_label});
function annotatedText(text, topicSpans, selectedTopicId) {
  const selectedIds = new Set((Array.isArray(selectedTopicId) ? selectedTopicId : [selectedTopicId]).map(String));
  const spans = [];
  topicSpans.forEach(item=>item.spans.forEach(span=>spans.push({...span, selected:selectedIds.has(String(item.topic_id)), label:item.topic_label})));
  let cursor=0, html="";
  for (const span of spans.sort((a,b)=>a.start_char-b.start_char || Number(b.selected)-Number(a.selected))) {
    const start=Math.max(cursor,Number(span.start_char)), end=Math.min(text.length,Math.max(start,Number(span.end_char)));
    if (end<=start) continue;
    const content=esc(text.slice(start,end));
    html+=esc(text.slice(cursor,start));
    html+=`<mark class="fsv2-topic-chunk ${span.selected ? "fsv2-selected-topic-chunk" : "fsv2-other-topic-chunk"}" tabindex="0" role="button" title="Assigned to: ${esc(span.label)}" data-topic-label="${esc(span.label)}">${content}</mark>`;
    cursor=end;
  }
  return html+esc(text.slice(cursor));
}
function supportsWebGL() { if (webglAvailable !== undefined) return webglAvailable; webglAvailable=!!window.WebGLRenderingContext; return webglAvailable; }
function updateMapModeSwitch() {
  document.querySelectorAll("[data-topic-map-mode]").forEach(button => {
    const is3d = button.dataset.topicMapMode === "3d";
    button.classList.toggle("fsv2-topic-map-mode-active", button.dataset.topicMapMode === activeMapMode);
    button.disabled = is3d && webglAvailable === false;
    button.title = button.disabled ? "3D view is unavailable because WebGL could not be started in this browser session." : "";
  });
  document.querySelectorAll("[data-topic-overlay-mode]").forEach(button => {
    const unavailable = button.dataset.topicOverlayMode === "mobility" && !currentTopicPoints.some(hasMobilityTag);
    button.classList.toggle("fsv2-topic-map-mode-active", button.dataset.topicOverlayMode === activeMapOverlay);
    button.disabled = unavailable;
    button.title = unavailable ? "Human-mobility tags are not yet curated for this source." : "";
  });
}
function markWebGLUnavailable(reason) {
  webglAvailable = false;
  activeMapMode = "2d";
  updateMapModeSwitch();
  renderFallbackMap(currentTopicPoints, currentTopicData, reason, true);
}
function renderSelectedMap() {
  if (!currentTopicData) return;
  updateMapModeSwitch();
  if (activeMapMode === "2d") return renderFallbackMap(currentTopicPoints, currentTopicData, "", false);
  renderTopicSpace(currentTopicPoints, currentTopicData);
}
let topicChartModules;
function loadChartModule(path){return new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=path;script.onload=resolve;script.onerror=reject;document.head.append(script);});}
function ensureTopicChartModules(){if(!topicChartModules)topicChartModules=loadChartModule("/static/vendor/highcharts/modules/heatmap.js");return topicChartModules;}
function renderTopicSpace(points, data) {
  disposeTopicSpace(); const host=document.getElementById("fsv2-bertopic-map"); host.replaceChildren();
  if (!supportsWebGL()) return markWebGLUnavailable("WebGL API is unavailable in this browser");
  const width=host.clientWidth || 800, height=host.clientHeight || 560;
  const scene=new THREE.Scene(); scene.background=new THREE.Color(0xf5f3ed);
  const camera=new THREE.PerspectiveCamera(45,width/height,.1,1000);
  let renderer; try { renderer=new THREE.WebGLRenderer({antialias:true}); } catch (error) { console.error("Topic Explorer WebGL renderer creation failed", error); return markWebGLUnavailable(`Renderer creation failed: ${error.message || error}`); } renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(width,height); host.append(renderer.domElement);
  renderer.domElement.addEventListener("webglcontextlost", event=>{event.preventDefault();console.error("Topic Explorer WebGL context lost");markWebGLUnavailable("The WebGL context was lost");},{once:true});
  const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=false; controls.screenSpacePanning=true;
  let threePointerDown=null, threePointerDragged=false;
  renderer.domElement.addEventListener("pointerdown",event=>{threePointerDown={x:event.clientX,y:event.clientY};threePointerDragged=false;});
  renderer.domElement.addEventListener("pointermove",event=>{if(threePointerDown&&Math.hypot(event.clientX-threePointerDown.x,event.clientY-threePointerDown.y)>6)threePointerDragged=true;});
  renderer.domElement.addEventListener("click",event=>{if(!threePointerDragged)return;event.stopImmediatePropagation();threePointerDragged=false;});
  const group=new THREE.Group(); scene.add(group); const selectable=[];
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),zs=points.map(p=>p.z); const center=new THREE.Vector3((Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2,(Math.min(...zs)+Math.max(...zs))/2); const span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),Math.max(...zs)-Math.min(...zs))||1; const scale=24/span;
  const groupById=new Map(points.map(topic=>{const grouping=mapGroup(topic);return [grouping.id,grouping];}));const familyIds=[...groupById.keys()].sort((left,right)=>groupById.get(left).label.localeCompare(groupById.get(right).label)); const familyColors=new Map(familyIds.map((id,index)=>[id,new THREE.Color().setHSL((index*.618)%1,.58,.43)]));
  // Do not collapse merely nearby topics into a single point. Their distance
  // is information in the projection and users can inspect it by rotating.
  const stacks=points.map(topic=>{const grouping=mapGroup(topic);return {x:topic.x,y:topic.y,z:topic.z,family_id:grouping.id,topics:[topic]};});
  const pointGeometry=new THREE.SphereGeometry(.48,14,14);
  stacks.forEach(stack=>{
    stack.mobilityIds=[...new Set(stack.topics.flatMap(topic=>topicMobilityTags(topic).map(tag=>tag.id)))];
    const material=new THREE.MeshPhongMaterial({color:familyColors.get(stack.family_id),transparent:true,opacity:.92});const mesh=new THREE.Mesh(pointGeometry,material);if(stack.topics.length>1)mesh.scale.setScalar(.62/.48);mesh.position.set((stack.x-center.x)*scale,(stack.y-center.y)*scale,(stack.z-center.z)*scale);mesh.userData.stack=stack;mesh.userData.baseScale=mesh.scale.clone();mesh.userData.baseColor=material.color.clone();
    if(stack.mobilityIds.length){const halo=new THREE.Mesh(pointGeometry,new THREE.MeshBasicMaterial({color:mobilityThemes[stack.mobilityIds[0]]?.color||"#1D9E75",transparent:true,opacity:.62,side:THREE.BackSide}));halo.position.copy(mesh.position);halo.scale.copy(mesh.scale).multiplyScalar(1.38);halo.visible=false;group.add(halo);mesh.userData.halo=halo;}
    group.add(mesh);selectable.push(mesh);
  });
  let hovered=null, selected=selectedMapTopicId ? selectable.find(mesh=>mesh.userData.stack.topics.some(topic=>String(topic.topic_id)===String(selectedMapTopicId)))||null : null;
  const legend=document.createElement("details"); legend.className="fsv2-topic-map-family-menu";
  const renderLegend=()=>{
    const menuButton=`<summary title="Show map families" aria-label="Show map families"><i class="ti ti-list" aria-hidden="true"></i></summary>`;
    if(activeMapOverlay==="mobility"){
      const ids=Object.keys(mobilityThemes).filter(id=>points.some(topic=>topicMobilityTags(topic).some(tag=>tag.id===id)));
      legend.innerHTML=`${menuButton}<div class="fsv2-topic-map-family-menu-panel"><p>Human mobility topics</p><small>Outlined points are explicitly tagged; other topics are faded.</small>${ids.map(id=>`<button type="button" data-mobility-id="${id}"><i style="background:${mobilityThemes[id].color}"></i>${esc(mobilityThemes[id].label)}</button>`).join("")}</div>`;
    } else legend.innerHTML=`${menuButton}<div class="fsv2-topic-map-family-menu-panel"><p>Map neighbourhoods</p>${familyIds.map(id=>`<button type="button" data-family-id="${id}"><i style="background:${familyColors.get(id).getStyle()}"></i>${esc(groupById.get(id).label)}</button>`).join("")}</div>`;
  };
  const applyHighlight=()=>{selectable.forEach(mesh=>{const stack=mesh.userData.stack;const familyMatch=!activeMapFamily||stack.family_id===activeMapFamily;const mobilityMatch=!activeMobilityTheme||stack.mobilityIds.includes(activeMobilityTheme);const visibleByOverlay=activeMapOverlay!=="mobility"||stack.mobilityIds.length>0;const topicMatch=!selected||mesh===selected;mesh.material.color.copy(topicMatch?mesh.userData.baseColor:new THREE.Color("#aeb7bc"));mesh.material.opacity=topicMatch?(familyMatch&&mobilityMatch&&visibleByOverlay?1:.09):.22;mesh.scale.copy(mesh.userData.baseScale).multiplyScalar(mesh===selected?1.35:1);mesh.material.emissive.set(mesh===selected?0x7a1f1f:mesh===hovered?0x4d2600:0x000000);if(mesh.userData.halo)mesh.userData.halo.visible=activeMapOverlay==="mobility"&&stack.mobilityIds.length>0&&mobilityMatch&&topicMatch;});legend.querySelectorAll("button[data-family-id]").forEach(button=>button.classList.toggle("fsv2-topic-family-active",button.dataset.familyId===activeMapFamily));legend.querySelectorAll("button[data-mobility-id]").forEach(button=>button.classList.toggle("fsv2-topic-family-active",button.dataset.mobilityId===activeMobilityTheme));render();};
  renderLegend();host.append(legend);
  legend.addEventListener("click",event=>{const familyButton=event.target.closest("button[data-family-id]");const mobilityButton=event.target.closest("button[data-mobility-id]");if(familyButton){activeMapFamily=activeMapFamily===familyButton.dataset.familyId?null:familyButton.dataset.familyId;applyHighlight();}if(mobilityButton){activeMobilityTheme=activeMobilityTheme===mobilityButton.dataset.mobilityId?null:mobilityButton.dataset.mobilityId;applyHighlight();}});
  const extent=13; scene.add(new THREE.AmbientLight(0xffffff,1.1)); const light=new THREE.DirectionalLight(0xffffff,.7);light.position.set(8,10,16);scene.add(light); const axes=new THREE.AxesHelper(extent);scene.add(axes); const grid=new THREE.GridHelper(extent*2,12,0xb9b6ae,0xd9d6ce);grid.position.y=-extent;scene.add(grid); const savedView=topicMapViewState.three;if(savedView){camera.position.fromArray(savedView.position);controls.target.fromArray(savedView.target);}else{camera.position.set(extent*2.65,extent*1.95,extent*2.65);controls.target.set(0,0,0);}controls.update();
  const tooltip=document.createElement("div");tooltip.className="fsv2-topic-space-tooltip";tooltip.hidden=true;host.append(tooltip);
  const popover=document.createElement("aside");popover.className="fsv2-topic-space-popover";popover.hidden=true;host.append(popover);
  const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
  const openTopic=topic=>{const mobility=topicMobilityTags(topic).map(tag=>tag.label).join(", ");popover.hidden=false;popover.innerHTML=`<button type="button" aria-label="Close topic details">×</button><strong>${esc(topic.display_label)}</strong><small>${esc(mapGroup(topic).label)}</small>${mobility?`<small>Human mobility: ${esc(mobility)}</small>`:""}<dl><div><dt>${esc(data.metric_label)}</dt><dd>${Number(topic.document_count).toLocaleString()}</dd></div><div><dt>Keywords</dt><dd>${esc(topic.keywords)}</dd></div></dl><button class="fsv2-topic-records-btn" type="button">Show matching records</button>`;popover.querySelector('[aria-label="Close topic details"]').onclick=()=>{popover.hidden=true;};popover.querySelector('.fsv2-topic-records-btn').onclick=()=>showRecords(topic).catch(console.error);};
  selectTopicOnMap=topic=>{selectedMapTopicId=topic?.topic_id||null;selected=selectable.find(mesh=>mesh.userData.stack.topics.some(item=>String(item.topic_id)===String(selectedMapTopicId)))||null;applyHighlight();if(topic)openTopic(topic);};
  renderer.domElement.addEventListener("pointermove",event=>{const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(selectable)[0]?.object||null;if(hit!==hovered){hovered=hit;renderer.domElement.style.cursor=hovered?"pointer":"grab";applyHighlight();}if(hovered){const stack=hovered.userData.stack,grouping=mapGroup(stack.topics[0]),mobility=stack.mobilityIds.map(id=>mobilityThemes[id]?.label).filter(Boolean).join(", ");tooltip.hidden=false;tooltip.textContent=(stack.topics.length>1?`${stack.topics.length} overlapping topics · ${grouping.label}`:`${stack.topics[0].display_label} · ${grouping.label}`)+(mobility?` · ${mobility}`:"");tooltip.style.left=`${event.offsetX+14}px`;tooltip.style.top=`${event.offsetY+14}px`;}else tooltip.hidden=true;});
  renderer.domElement.addEventListener("click",()=>{if(!hovered){if(activeMapFamily){activeMapFamily=null;applyHighlight();}return;}const topics=hovered.userData.stack.topics;if(topics.length===1)return selectTopicOnMap(topics[0]);popover.hidden=false;popover.innerHTML=`<button type="button" aria-label="Close topic details">×</button><strong>${topics.length} overlapping topics</strong><small>${esc(mapGroup(topics[0]).label)}</small><div class="fsv2-topic-stack-list">${topics.map(topic=>`<button data-topic-id="${topic.topic_id}">${esc(topic.display_label)} <span>${Number(topic.document_count).toLocaleString()}</span></button>`).join('')}</div>`;popover.querySelector('[aria-label="Close topic details"]').onclick=()=>{popover.hidden=true;};popover.querySelectorAll('[data-topic-id]').forEach(button=>button.onclick=()=>selectTopicOnMap(topics.find(topic=>topic.topic_id===button.dataset.topicId)));});
  renderer.domElement.addEventListener("click",()=>{if(hovered)return;selectedMapTopicId=null;selected=null;popover.hidden=true;applyHighlight();});
  const render=()=>renderer.render(scene,camera); const saveThreeView=()=>{topicMapViewState.three={position:camera.position.toArray(),target:controls.target.toArray()};}; controls.addEventListener("change",()=>{saveThreeView();render();}); const resize=()=>{const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);render();}; const resizeObserver=new ResizeObserver(resize); resizeObserver.observe(host); applyHighlight();
  disposeTopicSpace=()=>{saveThreeView();selectTopicOnMap=()=>{};resizeObserver.disconnect();controls.dispose();selectable.forEach(mesh=>{mesh.material.dispose();mesh.userData.halo?.material.dispose();});pointGeometry.dispose();renderer.dispose();};
}
function renderFallbackMap(points,data,reason="",isFallback=false){
  disposeTopicSpace();
  const host=document.getElementById("fsv2-bertopic-map"); host.replaceChildren();
  const groups=new Map(); points.forEach(point=>{const grouping=mapGroup(point);if(!groups.has(grouping.id))groups.set(grouping.id,{...grouping,points:[]});groups.get(grouping.id).points.push(point);});const groupList=[...groups.values()].sort((left,right)=>left.label.localeCompare(right.label));const colors=groupList.map((_,index)=>`hsl(${Math.round(((index*.618)%1)*360)}, 58%, 43%)`);
  const overlayNote=activeMapOverlay==="mobility"?"Outlined points are explicitly tagged as Human mobility; all other topics are faded.":"Each point is a topic. Nearby points use similar topic representations.";
  const series=groupList.map((group,index)=>({
    name:group.label,
    family_id:group.id,
    color:colors[index],
    data:group.points.map(point=>{
      const tags=topicMobilityTags(point),primary=tags[0]?.id;
      const theme=mobilityThemes[primary];
      const matches=!activeMobilityTheme||tags.some(tag=>tag.id===activeMobilityTheme);
      const dimmed=activeMapOverlay==="mobility"&&(!tags.length||!matches);
      return {x:point.x_2d,y:point.y_2d,topic:point,marker:{fillColor:colors[index],fillOpacity:dimmed ? 0.12 : 1,lineColor:activeMapOverlay==="mobility"&&tags.length ? theme?.color||"#1D9E75" : "#456568",lineWidth:activeMapOverlay==="mobility"&&tags.length ? 3 : 1.5}};
    }),
  }));
  const chart=Highcharts.chart(host,{chart:{type:"scatter",backgroundColor:"transparent",height:host.clientHeight||560,spacing:[28,18,18,18]},title:{text:isFallback?`2D fallback: ${reason}`:"Intertopic distance map",style:{fontSize:"16px",fontWeight:"600"}},subtitle:{text:isFallback?"3D has been disabled for this session.":overlayNote},xAxis:{title:{text:"Semantic dimension 1"},labels:{enabled:false},tickLength:0,gridLineWidth:0,lineWidth:0,plotLines:[{value:0,color:"#d9dddc",width:1,zIndex:1}]},yAxis:{title:{text:"Semantic dimension 2"},labels:{enabled:false},tickLength:0,gridLineWidth:0,lineWidth:0,plotLines:[{value:0,color:"#d9dddc",width:1,zIndex:1}]},legend:{enabled:false},exporting:{enabled:false},tooltip:{formatter(){const topic=this.point.topic,mobility=topicMobilityTags(topic).map(tag=>tag.label).join(", ");return `<b>${esc(topic.display_label)}</b><br/>${esc(mapGroup(topic).label)}${mobility?`<br/>Human mobility: ${esc(mobility)}`:""}<br/>${Number(topic.document_count).toLocaleString()} ${esc(data.metric_label.toLowerCase())}<br/><small>${esc(topic.keywords)}</small>`;}},plotOptions:{scatter:{allowPointSelect:true,marker:{radius:6,symbol:"circle",lineColor:"#456568",lineWidth:1.5},states:{hover:{halo:{size:7,opacity:.18},lineColor:"#1d4d50",lineWidth:2},select:{enabled:true,fillColor:"#d85a30",lineColor:"#703020",lineWidth:2}}},series:{point:{events:{click(){selectTopicOnMap(this.options.topic);showRecords(this.options.topic).catch(console.error);}}}}},series});
  chart.update({chart:{zooming:{type:"xy"},panning:{enabled:true,type:"xy"},panKey:"shift"}},false);
  if(topicMapViewState.two){chart.xAxis[0].setExtremes(topicMapViewState.two.xMin,topicMapViewState.two.xMax,false);chart.yAxis[0].setExtremes(topicMapViewState.two.yMin,topicMapViewState.two.yMax,false);chart.redraw();}
  let twoPointerDown=null, twoPointerDragged=false;
  chart.container.addEventListener("pointerdown",event=>{twoPointerDown={x:event.clientX,y:event.clientY};twoPointerDragged=false;});
  chart.container.addEventListener("pointermove",event=>{if(twoPointerDown&&Math.hypot(event.clientX-twoPointerDown.x,event.clientY-twoPointerDown.y)>6)twoPointerDragged=true;});
  chart.container.addEventListener("click",event=>{if(!twoPointerDragged)return;event.stopImmediatePropagation();twoPointerDragged=false;},true);
  const familyLegend=document.createElement("details"); familyLegend.className="fsv2-topic-map-family-menu";
  familyLegend.innerHTML=`<summary title="Show map families" aria-label="Show map families"><i class="ti ti-list" aria-hidden="true"></i></summary><div class="fsv2-topic-map-family-menu-panel"><p>Map neighbourhoods</p>${groupList.map((group,index)=>`<button type="button" data-family-id="${esc(group.id)}"><i style="background:${colors[index]}"></i>${esc(group.label)}</button>`).join("")}</div>`;
  const applyFamilyHighlight=()=>{chart.series.forEach(series=>{const familyMatches=!activeMapFamily||String(series.userOptions.family_id)===String(activeMapFamily);series.points.forEach(point=>{const topicMatches=!selectedMapTopicId||String(point.options.topic.topic_id)===String(selectedMapTopicId);const baseOpacity=Number(point.options.marker?.fillOpacity ?? 1);const attrs={opacity:topicMatches?(familyMatches?baseOpacity:baseOpacity*.12):.22,fill:topicMatches?point.options.marker?.fillColor:"#aeb7bc"};point.graphic?.attr(attrs);point.markerGraphic?.attr(attrs);});});familyLegend.querySelectorAll("button[data-family-id]").forEach(button=>button.classList.toggle("fsv2-topic-family-active",String(button.dataset.familyId)===String(activeMapFamily)));};
  familyLegend.addEventListener("click",event=>{const button=event.target.closest("button[data-family-id]");if(!button)return;activeMapFamily=String(activeMapFamily)===String(button.dataset.familyId)?null:button.dataset.familyId;applyFamilyHighlight();});
  host.append(familyLegend);
  selectTopicOnMap=topic=>{selectedMapTopicId=topic?.topic_id||null;chart.series.forEach(series=>series.points.forEach(point=>point.select(String(point.options.topic.topic_id)===String(selectedMapTopicId),false)));chart.redraw();applyFamilyHighlight();};
  chart.container.addEventListener("click",event=>{if(event.target.closest?.(".highcharts-point")||!activeMapFamily)return;activeMapFamily=null;applyFamilyHighlight();});
  chart.container.addEventListener("click",event=>{if(event.target.closest?.(".highcharts-point"))return;selectedMapTopicId=null;chart.series.forEach(series=>series.points.forEach(point=>point.select(false,false)));chart.redraw();applyFamilyHighlight();});
  applyFamilyHighlight();
  if(selectedMapTopicId){const selectedTopic=points.find(topic=>String(topic.topic_id)===String(selectedMapTopicId));if(selectedTopic)selectTopicOnMap(selectedTopic);}
  disposeTopicSpace=()=>{topicMapViewState.two={xMin:chart.xAxis[0].min,xMax:chart.xAxis[0].max,yMin:chart.yAxis[0].min,yMax:chart.yAxis[0].max};selectTopicOnMap=()=>{};chart.destroy();};
}
function renderSunburst(data) {
  const nodes = new Map(data.sunburst.map(node => [node.id, node]));
  const children = new Map();
  data.sunburst.forEach(node => {
    if (!node.parent) return;
    if (!children.has(node.parent)) children.set(node.parent, []);
    children.get(node.parent).push(node.id);
  });
  const absoluteRoot = data.sunburst.find(node => !node.parent)?.id;
  if (!absoluteRoot) return;
  const entryRoot = absoluteRoot;
  const entryNodes = children.get(entryRoot) || [];
  if (!nodes.has(sunburstRootId)) sunburstRootId = entryRoot;
  const palette = ["#1D9E75", "#378ADD", "#EF9F27", "#7F77DD", "#8B6F47"];
  const entryFamily = new Map(entryNodes.map((nodeId, index) => [nodeId, index]));
  const familyFor = nodeId => {
    let current = nodeId;
    while (current && !entryFamily.has(current) && current !== entryRoot) current = nodes.get(current)?.parent;
    return entryFamily.get(current) ?? 0;
  };
  const totalCache = new Map();
  const totalFor = id => {
    if (totalCache.has(id)) return totalCache.get(id);
    const node = nodes.get(id), childIds = children.get(id) || [];
    const total = childIds.length ? childIds.reduce((sum, childId) => sum + totalFor(childId), 0) : Number(node.value || 0);
    totalCache.set(id, total);
    return total;
  };
  const isEntryView = sunburstRootId === entryRoot;
  const visibleDepth = isEntryView ? 1 : 2, visible = new Map();
  const addBranch = (id, depth) => {
    visible.set(id, depth);
    if (depth < visibleDepth) (children.get(id) || []).forEach(childId => addBranch(childId, depth + 1));
  };
  addBranch(sunburstRootId, 0);
  const displayParent = id => {
    if (id === sunburstRootId) return "";
    return nodes.get(id).parent;
  };
  const blendWithWhite = (hex, share) => {
    const rgb = hex.match(/\w\w/g).map(value => parseInt(value, 16));
    const whiten = .78 * (1 - Math.max(0, Math.min(1, share)));
    return `rgb(${rgb.map(value => Math.round(value + (255 - value) * whiten)).join(",")})`;
  };
  const chartData = [...visible].map(([id, depth]) => {
    const node = nodes.get(id), childIds = children.get(id) || [];
    const isBoundary = depth === visibleDepth || !childIds.length;
    return {...node, parent: displayParent(id), value: isBoundary ? totalFor(id) : undefined};
  });
  const trail = [];
  for (let id = sunburstRootId; id; id = nodes.get(id)?.parent) trail.unshift(id);
  const breadcrumb = document.getElementById("fsv2-bertopic-sunburst-breadcrumb");
  breadcrumb.innerHTML = trail.map((id, index) => `<button type="button" data-sunburst-node="${esc(id)}" ${id === sunburstRootId ? "aria-current=\"page\"" : ""}>${esc(index ? nodes.get(id).name : "All topics")}</button>`).join('<span aria-hidden="true">/</span>');
  breadcrumb.querySelectorAll("[data-sunburst-node]").forEach(button => button.onclick = () => {
    sunburstRootId = button.dataset.sunburstNode;
    renderSunburst(data);
  });
  const gradientColors = new Map(chartData.map(node => {
    if (node.id === entryRoot) return [node.id, "#f5f3ed"];
    const anchor = isEntryView ? entryNodes.find(entryId => familyFor(node.id) === familyFor(entryId)) : sunburstRootId;
    const share = totalFor(node.id) / Math.max(totalFor(anchor), 1);
    const familyIndex = familyFor(anchor), baseColor = palette[familyIndex] || `hsl(${Math.round((familyIndex * 222.5) / Math.max(entryNodes.length, 1))}, 57%, 43%)`;
    return [node.id, blendWithWhite(baseColor, share)];
  }));
  const host = document.getElementById("fsv2-bertopic-sunburst");
  host.replaceChildren();
  const width = host.clientWidth || 520, height = 560, centerX = width / 2, centerY = height / 2;
  const outerRadius = Math.min(width, height) * .44, coreRadius = outerRadius * .22, ringWidth = (outerRadius - coreRadius) / visibleDepth;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "fsv2-topic-sunburst-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Interactive topic hierarchy");
  const tooltip = document.createElement("div");
  tooltip.className = "fsv2-topic-sunburst-tooltip";
  tooltip.hidden = true;
  host.append(svg, tooltip);
  const polar = (radius, angle) => [centerX + radius * Math.cos(angle - Math.PI / 2), centerY + radius * Math.sin(angle - Math.PI / 2)];
  const arc = (innerRadius, outerRadius, start, end) => {
    const [outerStartX, outerStartY] = polar(outerRadius, start), [outerEndX, outerEndY] = polar(outerRadius, end);
    const [innerEndX, innerEndY] = polar(innerRadius, end), [innerStartX, innerStartY] = polar(innerRadius, start);
    const largeArc = end - start > Math.PI ? 1 : 0;
    return `M ${outerStartX} ${outerStartY} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEndX} ${outerEndY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX} ${innerStartY} Z`;
  };
  const showTooltip = (event, id) => {
    const node = nodes.get(id), share = totalFor(id) / Math.max(totalFor(isEntryView ? (entryNodes.find(entryId => familyFor(id) === familyFor(entryId)) || id) : sunburstRootId), 1);
    tooltip.hidden = false;
    tooltip.innerHTML = `<strong>${esc(node.name)}</strong><span>${totalFor(id).toLocaleString()} ${esc(data.metric_label.toLowerCase())}${id === sunburstRootId ? " · 100%" : ` · ${(share * 100).toFixed(1)}% of selected family`}</span>`;
    tooltip.style.left = `${event.offsetX + 14}px`;
    tooltip.style.top = `${event.offsetY + 14}px`;
  };
  const drawNode = (id, depth, start, end) => {
    const allChildIds = children.get(id) || [];
    const childIds = allChildIds.filter(childId => visible.has(childId));
    const node = nodes.get(id), fill = gradientColors.get(id) || "#f5f3ed";
    const shape = document.createElementNS("http://www.w3.org/2000/svg", depth === 0 ? "circle" : "path");
    if (depth === 0) {
      shape.setAttribute("cx", centerX); shape.setAttribute("cy", centerY); shape.setAttribute("r", coreRadius);
    } else {
      shape.setAttribute("d", arc(coreRadius + ringWidth * (depth - 1), coreRadius + ringWidth * depth, start, end));
    }
    shape.setAttribute("fill", fill);
    shape.setAttribute("stroke", "rgba(255,255,255,.66)");
    shape.setAttribute("stroke-width", "1");
    shape.setAttribute("tabindex", allChildIds.length ? "0" : "-1");
    shape.setAttribute("aria-label", `${node.name}: ${totalFor(id).toLocaleString()} ${data.metric_label.toLowerCase()}`);
    if (allChildIds.length) shape.classList.add("fsv2-topic-sunburst-clickable");
    shape.addEventListener("pointerenter", event => showTooltip(event, id));
    shape.addEventListener("pointermove", event => showTooltip(event, id));
    shape.addEventListener("pointerleave", () => { tooltip.hidden = true; });
    const openBranch = () => { if (allChildIds.length) { sunburstRootId = id; renderSunburst(data); } };
    shape.addEventListener("click", openBranch);
    shape.addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && allChildIds.length) { event.preventDefault(); openBranch(); } });
    svg.append(shape);
    if (!childIds.length || depth === visibleDepth) return;
    let cursor = start;
    const parentTotal = Math.max(totalFor(id), 1);
    childIds.forEach(childId => {
      const next = cursor + (end - start) * totalFor(childId) / parentTotal;
      drawNode(childId, depth + 1, cursor, next);
      cursor = next;
    });
  };
  drawNode(sunburstRootId, 0, 0, Math.PI * 2);
}
function renderCharts(data){
  const colors=["#E69F00","#56B4E9","#009E73","#F0E442","#D55E00","#0072B2","#CC79A7"];
  const timestamp=value=>{const [year,month,day]=value.slice(0,10).split("-").map(Number),parts=value.slice(11).split(":"),seconds=(parts[2]||"0").split("."),milliseconds=Math.floor(Number(`0.${seconds[1]||"0"}`)*1000);return Date.UTC(year,month-1,day,Number(parts[0]||0),Number(parts[1]||0),Number(seconds[0]||0),milliseconds);};
  const timestampText=value=>new Date(value).toISOString().replace("Z","");
  const truncated=value=>value.length>40?`${value.slice(0,40)}…`:value;
  document.querySelectorAll("[data-topic-timeline-mode]").forEach(button=>{button.classList.toggle("is-active",button.dataset.topicTimelineMode===topicTimelineMode);button.onclick=()=>{topicTimelineMode=button.dataset.topicTimelineMode;renderCharts(data);};});
  const valuesByTopic=new Map(data.topics.map(topic=>[String(topic.id),[]]));
  const wordsByPoint=new Map(data.timeline.map(point=>[`${point.timestamp}:${point.topic_id}`,point.words]));
  if(topicTimelineMode==="share"){
    const shares=new Map(data.timeline_share.map(point=>[`${point.timestamp}:${point.topic_id}`,point]));
    data.topics.forEach(topic=>{valuesByTopic.set(String(topic.id),data.share_bins.map(bin=>{const point=shares.get(`${bin.timestamp}:${topic.id}`),value=point?.value||0;return {x:timestamp(bin.timestamp),y:(point?.share||0)*100,numerator:value,denominator:bin.total,words:wordsByPoint.get(`${bin.timestamp}:${topic.id}`)||""};}));});
  } else data.timeline.forEach(point=>valuesByTopic.get(String(point.topic_id))?.push({x:timestamp(point.timestamp),y:point.value,words:point.words}));
  const recordsButton=document.getElementById("fsv2-bertopic-timeline-records");
  let chart;
  const binTimes=(data.share_bins||[]).map(bin=>timestamp(bin.timestamp)).sort((left,right)=>left-right);
  const selectedTopics=()=>chart?.series.filter(series=>series.visible).map(series=>String(series.options.topic_id))||[];
  const selectedRange=()=>{const extremes=chart.xAxis[0].getExtremes();const visible=binTimes.filter(value=>value>=extremes.min&&value<=extremes.max);if(!visible.length)return {};const lastIndex=binTimes.indexOf(visible[visible.length-1]);return {start:timestampText(visible[0]),endExclusive:lastIndex<binTimes.length-1?timestampText(binTimes[lastIndex+1]):null};};
  const updateRecordsButton=()=>{const selected=selectedTopics();recordsButton.disabled=!selected.length;recordsButton.textContent=selected.length?`Show matching ${activeSource==="telegram"?"messages":"stories"} (${selected.length} topic${selected.length===1?"":"s"})`:"Show matching records";};
  chart=Highcharts.chart("fsv2-bertopic-timeline",{
    chart:{type:"line",height:560,backgroundColor:"transparent",zooming:{type:"x"},panning:{enabled:true,type:"x"},panKey:"shift"},
    colors,
    title:{text:null},
    xAxis:{type:"datetime",title:{text:"Date"},gridLineWidth:1,events:{afterSetExtremes:()=>updateRecordsButton()}},
    yAxis:{title:{text:topicTimelineMode==="share"?`Share of ${activeSource==="telegram"?"Human Mobility messages":"stories"} (%)`:"Frequency"},gridLineWidth:1,min:0,max:topicTimelineMode==="share"?100:undefined},
    tooltip:{useHTML:true,formatter(){const topic=this.series.userOptions.topic,point=this.point.options;if(topicTimelineMode==="share")return `<b>${esc(topic.label)}</b><br/>${Highcharts.dateFormat("%b %Y",this.x)}<br/>Messages: ${point.numerator.toLocaleString()} / ${point.denominator.toLocaleString()} · ${this.y.toFixed(1)}%<br/><small>Words: ${esc(point.words||"")}</small>`;return `<b>${esc(topic.label)}</b><br/>${Highcharts.dateFormat("%b %Y",this.x)}<br/>Frequency: ${this.y.toLocaleString()}<br/><small>Words: ${esc(point.words||"")}</small>`;}},
    legend:{title:{text:"Topics"},layout:"horizontal",align:"center",verticalAlign:"bottom",maxHeight:92,itemStyle:{fontWeight:"normal",fontSize:"11px",textOverflow:"ellipsis"},labelFormatter(){return truncated(this.userOptions.topic.label);}},
    plotOptions:{series:{marker:{enabled:false},states:{hover:{lineWidthPlus:1}},events:{legendItemClick(event){if(event.browserEvent?.detail===2){this.chart.series.forEach(series=>series.setVisible(series===this,false));this.chart.redraw();updateRecordsButton();return false;}setTimeout(updateRecordsButton,0);}}}},
    series:data.topics.map(topic=>({name:topic.label,topic_id:topic.id,topic,data:valuesByTopic.get(String(topic.id))||[]})),
  });
  recordsButton.onclick=()=>{const range=selectedRange();showRecordsForSelection({topicIds:selectedTopics(),title:`Matching records for ${selectedTopics().length} selected topic${selectedTopics().length===1?"":"s"}`,start:range.start,end_exclusive:range.endExclusive}).catch(console.error);};
  updateRecordsButton();
}
function sourceHeatmapColor(value){const ratio=Math.max(0,Math.min(1,value)),start=[238,243,247],end=[29,158,117],rgb=start.map((channel,index)=>Math.round(channel+(end[index]-channel)*ratio));return `rgb(${rgb.join(",")})`;}
function sourceLiftColor(logLift){const ratio=Math.min(1,Math.abs(logLift)/2),start=[238,243,247],end=logLift<0?[55,138,221]:[29,158,117],rgb=start.map((channel,index)=>Math.round(channel+(end[index]-channel)*ratio));return `rgb(${rgb.join(",")})`;}
function showSourceHeatmapInfo(event) {
  event.preventDefault(); event.stopPropagation();
  document.querySelector(".fsv2-topic-source-info-popover")?.remove();
  const button=event.currentTarget,card=button.closest(".fsv2-card"),popover=document.createElement("div");
  popover.className="fsv2-correlation-popover fsv2-temporal-popover fsv2-correlation-info-popover fsv2-topic-source-info-popover";
  popover.innerHTML=`<div class="fsv2-correlation-popover-head"><strong>How to read this heatmap</strong><button type="button" aria-label="Close">×</button></div><div class="fsv2-correlation-info-body fsv2-correlation-guide"><section class="fsv2-correlation-guide-section"><h3><i class="ti ti-git-branch" aria-hidden="true"></i> Topic families</h3><p>Each row is one of the same topic families used to colour the semantic map. They are created by clustering nearby BERTopic topic representations in the UMAP semantic space; a family therefore groups topics that are close in that map.</p></section><section class="fsv2-correlation-guide-section"><h3><i class="ti ti-broadcast" aria-hidden="true"></i> Sources shown</h3><p>Sources are ranked by their original message or story volume. Starting with the largest, the chart includes sources while their cumulative volume remains within the first <b>90%</b> of the corpus. This keeps the heatmap focused on the sources that account for most records.</p></section><section class="fsv2-correlation-guide-section"><h3><i class="ti ti-layers-subtract" aria-hidden="true"></i> Choose a measure</h3><div class="fsv2-correlation-scope-card"><strong>Corpus share</strong><p>The share of all records from the included sources that mention that family. This is the default and shows absolute footprint.</p></div><div class="fsv2-correlation-scope-card"><strong>Relative presence</strong><p>Each family is scaled against its strongest included source: 100% marks that source, so this view compares where the family is most present.</p></div><div class="fsv2-correlation-scope-card"><strong>Over-representation</strong><p>Compares the observed family presence with the presence expected from the family’s overall prevalence and the source’s volume. Green means more than expected; blue means less. Values use log₂(lift): +1 is twice expected and −1 is half expected.</p></div></section><p class="fsv2-correlation-note"><i class="ti ti-info-circle" aria-hidden="true"></i> A record counts once per family, even if it contains several topics from that family.</p></div>`;
  const cardRect=card.getBoundingClientRect(),popoverWidth=Math.min(380,window.innerWidth-32);
  popover.style.setProperty("width",`${popoverWidth}px`,"important");
  popover.style.setProperty("position","absolute","important");
  popover.style.setProperty("transform","none","important");
  const updatePosition=()=>{const anchor=button.getBoundingClientRect();popover.style.setProperty("top",`${anchor.bottom-cardRect.top+10}px`,"important");popover.style.setProperty("left",`${Math.max(16,anchor.right-cardRect.left-popoverWidth)}px`,"important");};
  const close=()=>{popover.remove();document.removeEventListener("keydown",onKeyDown);document.removeEventListener("click",onOutsideClick);};
  const onKeyDown=keyEvent=>{if(keyEvent.key==="Escape")close();};
  const onOutsideClick=clickEvent=>{if(!popover.contains(clickEvent.target)&&clickEvent.target!==button)close();};
  popover.querySelector("button").onclick=close; card.style.position="relative";card.append(popover);updatePosition();
  document.addEventListener("keydown",onKeyDown);document.addEventListener("click",onOutsideClick);
}
function renderSourceDistribution(data){const container=document.getElementById("fsv2-bertopic-heatmap"),families=data.families||[],sources=data.sources||[];document.querySelectorAll("[data-source-heatmap-mode]").forEach(button=>{button.classList.toggle("is-active",button.dataset.sourceHeatmapMode===sourceHeatmapMode);button.onclick=()=>{sourceHeatmapMode=button.dataset.sourceHeatmapMode;renderSourceDistribution(data);};});if(!container)return;if(!families.length||!sources.length){container.innerHTML='<div class="fsv2-topic-heatmap-empty"><strong>No source distribution available</strong><span>No sources fell within the selected cumulative-volume threshold.</span></div>';return;}const short=value=>String(value).replace(/^https?:\/\/(www\.)?/,"").replace(/^t\.me\//,"@"),points=new Map((data.heatmap||[]).map(point=>[`${point.family_id}:${point.source}`,point])),maximumCorpusShare=Math.max(...(data.heatmap||[]).map(point=>point.corpus_share||0),1e-12);let cells=['<div></div>'];sources.forEach(source=>cells.push(`<div class="fsv2-topic-heatmap-label fsv2-topic-heatmap-label-top" title="${esc(source.name)}">${esc(short(source.name))}</div>`));families.forEach(family=>{const row=sources.map(source=>points.get(`${family.id}:${source.name}`)),rowMaximum=Math.max(...row.map(point=>point?.value||0),1);cells.push(`<div class="fsv2-topic-heatmap-label fsv2-topic-heatmap-label-side" title="${esc(family.label)}">${esc(family.label)}</div>`);sources.forEach((source,index)=>{const point=row[index],value=point?.value||0,relative=value/rowMaximum,corpusShare=point?.corpus_share||0;if(sourceHeatmapMode==="lift"){if(value<3){cells.push('<div class="fsv2-topic-heatmap-cell" style="background:#f4f5f5" title="Fewer than 3 records: lift is not displayed."></div>');return;}const logLift=Math.log2(point.lift),label=`${logLift>=0?"+":""}${logLift.toFixed(1)}`,title=`${family.label} in ${source.name}: ${value.toLocaleString()} ${data.metric_label.toLowerCase()} · ${point.lift.toFixed(2)}× expected · ${(corpusShare*100).toFixed(1)}% of selected corpus`;cells.push(`<div class="fsv2-topic-heatmap-cell" style="background:${sourceLiftColor(logLift)}" title="${esc(title)}">${label}</div>`);return;}if(sourceHeatmapMode==="corpus"){const percentage=corpusShare*100,title=`${family.label} in ${source.name}: ${value.toLocaleString()} ${data.metric_label.toLowerCase()} · ${percentage.toFixed(1)}% of all selected-source records`;cells.push(`<div class="fsv2-topic-heatmap-cell" style="background:${sourceHeatmapColor(corpusShare/maximumCorpusShare)}" title="${esc(title)}">${value?`${percentage.toFixed(1)}%`:""}</div>`);return;}const percentage=Math.round(relative*100),title=`${family.label} in ${source.name}: ${value.toLocaleString()} ${data.metric_label.toLowerCase()} · ${percentage}% of this family's strongest selected source · ${(corpusShare*100).toFixed(1)}% of selected corpus`;cells.push(`<div class="fsv2-topic-heatmap-cell" style="background:${sourceHeatmapColor(relative)}" title="${esc(title)}">${value?`${percentage}%`:""}</div>`);});});const legend=sourceHeatmapMode==="lift"?'<span>Under-represented</span><span class="fsv2-topic-heatmap-legend-scale" style="background:linear-gradient(90deg,#378add,#eef3f7,#1d9e75)"></span><span>Over-represented</span><span>· log₂(lift); ±1 means half / twice expected</span>':sourceHeatmapMode==="corpus"?'<span>Smaller absolute footprint</span><span class="fsv2-topic-heatmap-legend-scale" style="background:linear-gradient(90deg,#eef3f7,#1d9e75)"></span><span>Larger absolute footprint</span><span>· share of all selected-source records</span>':'<span>Lower presence within family</span><span class="fsv2-topic-heatmap-legend-scale" style="background:linear-gradient(90deg,#eef3f7,#1d9e75)"></span><span>Highest selected source</span><span>· relative to each family’s strongest source</span>';container.innerHTML=`<div class="fsv2-topic-heatmap"><div class="fsv2-topic-heatmap-grid" style="grid-template-columns:minmax(250px,1.8fr) repeat(${sources.length},minmax(42px,1fr))">${cells.join("")}</div><div class="fsv2-topic-heatmap-legend">${legend}<span>· ${Math.round((data.source_threshold||.9)*100)}% cumulative source volume</span></div></div>`;}
async function showRecords(topic, append=false) {
  return showRecordsForSelection({topicIds:[String(topic.topic_id)],title:topic.display_label,selectedTopicIds:[String(topic.topic_id)]},append);
}
async function showRecordsForSelection(request, append=false) {
  const dialog=document.getElementById("fsv2-bertopic-records-dialog"), target=document.getElementById("fsv2-bertopic-records"), actions=document.getElementById("fsv2-bertopic-records-actions");
  if (!append) { selectedRecordsRequest=request; recordsOffset=0; }
  const currentRequest=selectedRecordsRequest;
  document.getElementById("fsv2-bertopic-records-title").textContent=currentRequest.title;
  document.getElementById("fsv2-bertopic-records-note").textContent=activeSource === "telegram" ? "Whole modeled messages; highlighted passages match the selected topic or topics." : "Stories assigned to the selected topic or topics.";
  document.getElementById("fsv2-bertopic-records-close").onclick=()=>dialog.close();
  dialog.onclick=event=>{if(event.target===dialog)dialog.close();};
  if(!dialog.open)dialog.showModal();
  if (!append) { target.innerHTML='<tr><td colspan="3" class="fsv2-bertopic-records-loading">Loading records…</td></tr>';actions.replaceChildren(); }
  const params=new URLSearchParams({source:activeSource,topic_ids:currentRequest.topicIds.join(","),offset:String(recordsOffset)});
  if(currentRequest.start)params.set("start",currentRequest.start);
  if(currentRequest.end)params.set("end",currentRequest.end);
  if(currentRequest.end_exclusive)params.set("end_exclusive",currentRequest.end_exclusive);
  const data=await fetch(`/sd/bertopic/records?${params}`).then(r=>r.json());
  const recordLabel=activeSource === "telegram" ? "message" : "story", total=Number(data.total||0);
  document.getElementById("fsv2-bertopic-records-note").textContent=`${total.toLocaleString()} matching ${recordLabel}${total===1?"":"s"} · ${activeSource === "telegram" ? "Whole modeled messages; highlighted passages match the selected topic or topics." : "Stories assigned to the selected topic or topics."}`;
  recordsOffset+=data.records.length;
  const records=data.records.map((record,index)=>{
    const isTelegram=activeSource === "telegram",url=isTelegram?record.message_url:record.url,time=isTelegram?record.timestamp:record.publish_date,text=isTelegram?record.modeled_text:(record.body_en||record.title_original||record.title_en||"");
    const renderedText=isTelegram?annotatedText(text,record.topic_spans||[],currentRequest.selectedTopicIds||currentRequest.topicIds):esc(text);
    return `<tr><td class="fsv2-bertopic-record-url"><a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(url)}</a></td><td><time>${esc(time)}</time></td><td><div class="fsv2-bertopic-record-text" data-record-text>${renderedText}</div><button type="button" class="fsv2-bertopic-expand" data-record-expand aria-expanded="false">Show full text</button></td></tr>`;
  }).join("");
  if(append)target.insertAdjacentHTML("beforeend",records);else target.innerHTML=records||'<tr><td colspan="3" class="fsv2-bertopic-records-loading">No matching records.</td></tr>';
  actions.replaceChildren();
  if (data.has_more) { const button=document.createElement("button"); button.type="button"; button.className="fsv2-btn fsv2-btn-secondary fsv2-bertopic-load-more"; button.textContent=`Load 20 more ${activeSource === "telegram" ? "messages" : "stories"}`; button.onclick=()=>showRecordsForSelection(selectedRecordsRequest,true).catch(console.error); actions.append(button); }
  target.querySelectorAll("[data-record-expand]").forEach(button=>button.onclick=()=>{const text=button.previousElementSibling,expanded=text.classList.toggle("is-expanded");button.setAttribute("aria-expanded",String(expanded));button.textContent=expanded?"Collapse text":"Show full text";});
  target.querySelectorAll(".fsv2-topic-chunk").forEach(chunk=>{
    const revealTopic=event=>{event.stopPropagation();target.querySelectorAll(".fsv2-topic-chunk-open").forEach(item=>{if(item!==chunk)item.classList.remove("fsv2-topic-chunk-open");});chunk.classList.toggle("fsv2-topic-chunk-open");showTopicChunkTooltip(chunk);};
    chunk.onclick=revealTopic;
    chunk.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();revealTopic(event);}};
  });
}
async function loadTopics() {
  const panel=document.querySelector('[data-panel="topics"]'); if (!panel || panel.hidden) return;
  const data=await fetch(`/sd/bertopic/explorer?source=${activeSource}`).then(r=>r.json());
  document.getElementById("fsv2-bertopic-metric").textContent=`${data.metric_label} · ${data.total_documents.toLocaleString()} records in corpus`;
  const kpis=data.kpis,periodFormatter=new Intl.DateTimeFormat("en",{month:"short",year:"numeric"});
  document.getElementById("fsv2-bertopic-kpi-record-label").textContent=kpis.record_label;
  document.getElementById("fsv2-bertopic-kpi-records").textContent=data.total_documents.toLocaleString();
  document.getElementById("fsv2-bertopic-kpi-record-detail").textContent=kpis.record_detail;
  document.getElementById("fsv2-bertopic-kpi-assigned-label").textContent=kpis.assigned_label;
  document.getElementById("fsv2-bertopic-kpi-assigned").textContent=kpis.assigned_record_count.toLocaleString();
  document.getElementById("fsv2-bertopic-kpi-assigned-detail").textContent=kpis.assigned_detail;
  document.getElementById("fsv2-bertopic-kpi-topics").textContent=kpis.topic_count.toLocaleString();
  document.getElementById("fsv2-bertopic-kpi-period").textContent=kpis.period_start&&kpis.period_end?`${periodFormatter.format(new Date(`${kpis.period_start}T00:00:00Z`))} – ${periodFormatter.format(new Date(`${kpis.period_end}T00:00:00Z`))}`:"—";
  const points=data.topics.filter(p=>p.document_count);
  if (!points.some(hasMobilityTag)) { activeMapOverlay="all"; activeMobilityTheme=null; }
  currentTopicPoints=points; currentTopicData=data;
  renderSelectedMap();
  fetch(`/sd/bertopic/charts?source=${activeSource}`).then(response=>response.json()).then(data=>ensureTopicChartModules().then(()=>{renderCharts(data);renderSourceDistribution(data);})).catch(console.error);
  document.getElementById("fsv2-bertopic-list").innerHTML=points.map(p=>`<button class="fsv2-topic-row" data-topic-id="${p.topic_id}"><strong>${esc(p.display_label)}</strong><span>${p.document_count.toLocaleString()}</span><small>${esc(p.keywords)}</small></button>`).join("");
  document.querySelectorAll("#fsv2-bertopic-list [data-topic-id]").forEach(button=>button.addEventListener("click",()=>{const topic=points.find(p=>p.topic_id===button.dataset.topicId);selectTopicOnMap(topic);}));
  loaded=true;
}
document.addEventListener("click",event=>{const sourceInfo=event.target.closest(".fsv2-topic-source-info");if(sourceInfo){showSourceHeatmapInfo({currentTarget:sourceInfo,preventDefault:()=>{},stopPropagation:()=>{}});return;}const mapMode=event.target.closest("[data-topic-map-mode]")?.dataset.topicMapMode;if(mapMode){if(mapMode==="3d"&&webglAvailable===false)return;activeMapMode=mapMode;renderSelectedMap();return;}const overlayMode=event.target.closest("[data-topic-overlay-mode]")?.dataset.topicOverlayMode;if(overlayMode){activeMapOverlay=overlayMode;activeMobilityTheme=null;renderSelectedMap();return;}const source=event.target.closest("[data-bertopic-source]")?.dataset.bertopicSource;if(source){activeSource=source;document.querySelectorAll("[data-bertopic-source]").forEach(b=>b.classList.toggle("fsv2-source-tab-active",b.dataset.bertopicSource===source));loadTopics().catch(console.error);}if(event.target.closest('[data-panel="topics"]')&&!loaded)setTimeout(()=>loadTopics().catch(console.error),0);});
