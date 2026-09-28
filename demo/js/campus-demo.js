"use strict";
/* ============================================================
   campus-demo.js —— 模板校园（示例数据）
   保留原始示例布局，作为自定义接入的参考模板：?campus=demo
   ============================================================ */
registerCampus((()=>{
  const outer = roundedRect({x:-360,y:-260},{x:360,y:260},70,8);
  const track = stadiumTrack({x:-230,y:150},42.195,36.5);
  return {
    id: "demo",
    name: "模板校园（示例数据）",
    subtitle: "占位布局 —— 自定义接入请照此结构编写 campus-<你的学校>.js",
    origin: { lat:30.0000000, lon:120.0000000 },
    accent: "#f9c63a",

    roads: [
      { name:"北环路",  pts:outer,                          w:8, closed:true },
      { name:"中轴路",  pts:[{x:0,y:-260},{x:0,y:260}],     w:7 },
      { name:"东横路",  pts:[{x:-360,y:0},{x:360,y:0}],     w:6 },
      { name:"西横路",  pts:[{x:-360,y:150},{x:-140,y:150}],w:5 },
      { name:"操场支路",pts:[{x:-140,y:150},{x:0,y:150}],   w:5 },
      { name:"东侧支路",pts:[{x:180,y:0},{x:180,y:150}],    w:5 },
      { name:"操场跑道",pts:track.pts,                      w:9, closed:true, isTrack:true }
    ],
    buildings: [
      { n:"图书馆",   c:{x:90,y:150},   s:{x:90,y:70},  k:"library" },
      { n:"教学楼A",  c:{x:180,y:-70},  s:{x:70,y:110}, k:"teach" },
      { n:"教学楼B",  c:{x:270,y:-70},  s:{x:70,y:110}, k:"teach" },
      { n:"第二食堂", c:{x:-70,y:-180}, s:{x:100,y:60}, k:"canteen" },
      { n:"宿舍楼1",  c:{x:-330,y:-190},s:{x:40,y:80},  k:"dorm" },
      { n:"宿舍楼2",  c:{x:-280,y:-190},s:{x:40,y:80},  k:"dorm" },
      { n:"宿舍楼3",  c:{x:-230,y:-190},s:{x:40,y:80},  k:"dorm" },
      { n:"体育馆",   c:{x:230,y:190},  s:{x:100,y:80}, k:"gym" },
      { n:"行政楼",   c:{x:40,y:215},   s:{x:80,y:50},  k:"admin" },
      { n:"实验楼",   c:{x:-70,y:60},   s:{x:70,y:60},  k:"lab" }
    ],
    water: [],
    forests: [
      { name:"北苑林", c:{x:-150,y:60}, rx:45, ry:45, count:14, seed:777 }
    ],
    trails: [],
    landmarks: [
      { n:"图书馆",   c:{x:90,y:150},   r:45, desc:"示例地标" },
      { n:"第二食堂", c:{x:-70,y:-180}, r:45, desc:"示例地标" },
      { n:"体育馆",   c:{x:230,y:190},  r:45, desc:"示例地标" }
    ],
    gates: [
      { n:"北门", c:{x:0,y:260} },
      { n:"南门", c:{x:0,y:-260} }
    ],
    mainRoutePts: outer
  };
})());
