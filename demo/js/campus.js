"use strict";
/* ============================================================
   campus.js —— 校园布局（当前：示例校园；苏州校区见 campus-suzhou.js）
   ============================================================ */
const ORIGIN = { lat:30.0000000, lon:120.0000000 };  // ← 占位，换成你学校的坐标

const BUILDING_COLORS = {
  library:[82,90,118], teach:[107,100,90], canteen:[122,102,74], dorm:[96,90,107],
  gym:[77,108,100], admin:[111,97,83], lab:[90,102,111]
};

const CAMPUS = (()=>{
  const outer = roundedRect({x:-360,y:-260},{x:360,y:260},70,8);
  const track = stadiumTrack({x:-230,y:150},42.195,36.5);
  return {
    name:"示例校园",
    roads:[
      {name:"北环路", pts:outer,        w:8,   closed:true},
      {name:"中轴路", pts:[{x:0,y:-260},{x:0,y:260}],               w:7, closed:false},
      {name:"东横路", pts:[{x:-360,y:0},{x:360,y:0}],               w:6, closed:false},
      {name:"西横路", pts:[{x:-360,y:150},{x:-140,y:150}],          w:5, closed:false},
      {name:"操场支路",pts:[{x:-140,y:150},{x:0,y:150}],            w:5, closed:false},
      {name:"东侧支路",pts:[{x:180,y:0},{x:180,y:150}],             w:5, closed:false},
      {name:"操场跑道",pts:track.pts,                               w:9, closed:true, isTrack:true}
    ],
    buildings:[
      {n:"图书馆", c:{x:90,y:150},  s:{x:90,y:70},  k:"library"},
      {n:"教学楼A",c:{x:180,y:-70}, s:{x:70,y:110}, k:"teach"},
      {n:"教学楼B",c:{x:270,y:-70}, s:{x:70,y:110}, k:"teach"},
      {n:"第二食堂",c:{x:-70,y:-180},s:{x:100,y:60},k:"canteen"},
      {n:"宿舍楼1",c:{x:-330,y:-190},s:{x:40,y:80}, k:"dorm"},
      {n:"宿舍楼2",c:{x:-280,y:-190},s:{x:40,y:80}, k:"dorm"},
      {n:"宿舍楼3",c:{x:-230,y:-190},s:{x:40,y:80}, k:"dorm"},
      {n:"体育馆", c:{x:230,y:190}, s:{x:100,y:80}, k:"gym"},
      {n:"行政楼", c:{x:40,y:215},  s:{x:80,y:50},  k:"admin"},
      {n:"实验楼", c:{x:-70,y:60},  s:{x:70,y:60},  k:"lab"}
    ],
    mainRoute: new Polyline(outer, true)
  };
})();
