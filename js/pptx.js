/**
 * pptx.js
 * PowerPoint export via PptxGenJS.
 *
 * Features:
 *   - All row types: projet, groupe (multi-level indent), tâche, jalon
 *   - Auto-fit: row height calculated so everything fits on one slide
 *   - Dates side-by-side: debut → fin
 *   - Multi-slide pagination if rows exceed capacity
 *
 * Depends on: config.js, state.js, utils.js, sort.js (isVisible)
 * Requires: PptxGenJS global
 */

// ====== EXPORT PPTX ======
let _pptxExportReady = false; // flag: modal confirmed

function exportPPTX(){
  _pptxExportReady = false;
  const tasks=rows.filter(r=>r._type==='tache');
  if(!tasks.length){alert('Aucune donnée à exporter.');return;}

  // Pre-calculate how many slides will be needed
  const HEADER_H=0.62, AXIS_H=0.26, ROW_H_IN=0.21, SLIDE_H=7.5;
  const TOP_Y=HEADER_H+0.04;
  const AVAILABLE_H=SLIDE_H-TOP_Y-AXIS_H-0.22;
  const ROWS_PER_SLIDE=Math.floor(AVAILABLE_H/ROW_H_IN);
  const visible=rows.filter(r=>isVisible(r));
  const nbSlides=Math.ceil(visible.length/ROWS_PER_SLIDE)||1;

  if(nbSlides>1){
    // Show styled warning modal
    document.getElementById('pptxModalDesc').textContent =
      `${visible.length} lignes visibles · capacité ${ROWS_PER_SLIDE} lignes/slide`;
    document.getElementById('pptxModalDetail').innerHTML =
      `<b style="color:var(--accent)">${nbSlides} slides</b> seront générées pour contenir tout le Gantt.<br>`+
      `Lignes visibles : <b>${visible.length}</b> &nbsp;|&nbsp; Lignes par slide : <b>${ROWS_PER_SLIDE}</b>`;
    const modal=document.getElementById('pptxModal');
    modal.style.display='flex';
  } else {
    _runPptxExport();
  }
}

function closePptxModal(){
  document.getElementById('pptxModal').style.display='none';
}

function confirmPptxExport(){
  closePptxModal();
  _runPptxExport();
}

function _runPptxExport(){
  const allTasks=rows.filter(r=>r._type==='tache');
  if(!allTasks.length) return;

  // ── Palette ──────────────────────────────────────────────────────────
  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const BG      = isDark ? '0f1620' : 'f5f6f8';
  const SURFACE = isDark ? '162130' : 'ffffff';
  const NAVY    = isDark ? '1c2d3f' : '284053';
  const TEXT    = isDark ? 'e2eaf2' : '284053';
  const MUTED   = isDark ? '7a94a8' : '727F8E';
  const ACCENT  = 'EC7206';
  const BORDER  = isDark ? '2a3d52' : 'dde1e8';

  // ── Date range ───────────────────────────────────────────────────────
  let minD = allTasks.reduce((m,r)=>r.debut<m?r.debut:m, allTasks[0].debut);
  let maxD = allTasks.reduce((m,r)=>r.fin>m?r.fin:m, allTasks[0].fin);
  // Étendre si des jalons dépassent
  rows.filter(r=>r._type==='jalon'&&r.date).forEach(j=>{
    if(j.date<minD) minD=new Date(j.date);
    if(j.date>maxD) maxD=new Date(j.date);
  });
  if(view!=='mois'){
    const d1=minD.getDay(); minD=new Date(minD); minD.setDate(minD.getDate()-(d1===0?6:d1-1));
    const d2=maxD.getDay(); maxD=new Date(maxD); maxD.setDate(maxD.getDate()+(d2===0?0:7-d2));
  } else {
    minD=new Date(minD.getFullYear(),minD.getMonth(),1);
    maxD=new Date(maxD.getFullYear(),maxD.getMonth()+1,0);
  }
  const totalDays = diff(minD,maxD)||1;
  const visible   = rows.filter(r=>isVisible(r));

  // ── Slide layout ─────────────────────────────────────────────────────
  const SLIDE_W   = 13.3;
  const SLIDE_H   = 7.5;
  const HEADER_H  = 0.55;
  const AXIS_H    = 0.24;
  const MARGIN_B  = 0.20;
  const TOP_Y     = HEADER_H + 0.03;

  // Auto-fit row height so everything fits on ONE slide
  const AVAILABLE_H = SLIDE_H - TOP_Y - AXIS_H - MARGIN_B;
  const ROW_H_IN = Math.min(0.20, Math.max(0.10, AVAILABLE_H / Math.max(visible.length, 1)));

  // Left panel columns
  const LABEL_W  = 2.10;
  const DATE_W   = 0.95;
  const CHARGE_W = 0.34;
  const LEFT_W   = LABEL_W + DATE_W + CHARGE_W;
  const CHART_X  = LEFT_W + 0.04;
  const CHART_W  = SLIDE_W - CHART_X - 0.04;

  // ── Helpers ───────────────────────────────────────────────────────────
  function hexNoHash(h){ return h.replace('#',''); }
  function projectHex(p){ return hexNoHash(getColor(p)); }
  function lightenHex(hex,pct){
    let c=parseInt(hex,16);
    let r=(c>>16)&0xff,g=(c>>8)&0xff,b=c&0xff;
    r=Math.min(255,r+Math.round((255-r)*pct/100));
    g=Math.min(255,g+Math.round((255-g)*pct/100));
    b=Math.min(255,b+Math.round((255-b)*pct/100));
    return (r<<16|g<<8|b).toString(16).padStart(6,'0');
  }

  // Mois pour l'axe
  const monthsAxis=[];
  let mc=new Date(minD.getFullYear(),minD.getMonth(),1);
  while(mc<=maxD){
    const start=new Date(mc);
    const end=new Date(mc.getFullYear(),mc.getMonth()+1,0);
    let sOff,eOff;
    if(view==='mois'){
      sOff=monthsAxis.length; eOff=monthsAxis.length+1;
    } else {
      sOff=Math.max(0,diff(minD,start))/totalDays;
      eOff=Math.min(1,(diff(minD,end)+1)/totalDays);
    }
    monthsAxis.push({label:MOIS[mc.getMonth()]+' '+mc.getFullYear().toString().slice(2),sOff,eOff});
    mc.setMonth(mc.getMonth()+1);
  }
  if(view==='mois'){
    const n=monthsAxis.length;
    monthsAxis.forEach((m,i)=>{m.sOff=i/n; m.eOff=(i+1)/n;});
  }

  function xOfDay(d){
    if(view==='mois'){
      const mIdx=monthsAxis.findIndex((_,i)=>{
        const ms=new Date(minD.getFullYear(),minD.getMonth()+i,1);
        const me=new Date(minD.getFullYear(),minD.getMonth()+i+1,0);
        return d>=ms&&d<=me;
      });
      if(mIdx<0) return d<minD?0:1;
      const ms=new Date(minD.getFullYear(),minD.getMonth()+mIdx,1);
      const me=new Date(minD.getFullYear(),minD.getMonth()+mIdx+1,1);
      const dim=diff(ms,me);
      return (mIdx+diff(ms,d)/dim)/monthsAxis.length;
    }
    return diff(minD,d)/totalDays;
  }
  function chartX(frac){ return CHART_X + frac*CHART_W; }
  function barW(d1,d2){
    const f = view==='mois'
      ? Math.max(0.008, xOfDay(d2)-xOfDay(d1)+0.004)
      : Math.max(0.008, diff(d1,d2)/totalDays + 1/totalDays);
    return Math.max(0.05, f*CHART_W);
  }

  // ── Build presentation ───────────────────────────────────────────────
  const pres = new PptxGenJS();
  pres.layout  = 'LAYOUT_WIDE';
  pres.author  = '4CAD Group';
  pres.title   = 'Gantt — ' + new Date().toLocaleDateString('fr-FR');

  const today=new Date(); today.setHours(0,0,0,0);
  const todayFrac=xOfDay(today);
  const todayInRange=today>=minD&&today<=maxD;

  // Une seule slide (auto-fit) — si trop de lignes, on pagine quand même
  const ROWS_PER_SLIDE = Math.max(visible.length, Math.floor(AVAILABLE_H/0.10));
  const pages=[];
  for(let i=0;i<visible.length;i+=Math.floor(AVAILABLE_H/ROW_H_IN)){
    pages.push(visible.slice(i,i+Math.floor(AVAILABLE_H/ROW_H_IN)));
  }
  if(!pages.length) pages.push([]);

  pages.forEach((pageRows, pageIdx)=>{
    const slide = pres.addSlide();
    slide.background = {color:BG};

    // Header bar
    slide.addShape(pres.ShapeType.rect,{x:0,y:0,w:SLIDE_W,h:HEADER_H,fill:{color:NAVY},line:{color:ACCENT,width:3}});
    slide.addText([{text:'GANTT',options:{bold:true,color:'FFFFFF'}},{text:'.',options:{bold:true,color:ACCENT}}],
      {x:0.12,y:0,w:1.4,h:HEADER_H,fontSize:18,fontFace:'Arial',valign:'middle',margin:0});
    const viewLabel=view==='semaine'?'Vue Semaine':view==='mois'?'Vue Mois':'Vue Jour';
    slide.addText(`${viewLabel}  ·  ${new Date().toLocaleDateString('fr-FR')}  ·  ${pageIdx+1}/${pages.length}`,
      {x:1.7,y:0,w:SLIDE_W-2,h:HEADER_H,fontSize:8.5,fontFace:'Arial',color:'FFFFFF',valign:'middle',margin:0});

    // Left panel axis header
    slide.addShape(pres.ShapeType.rect,{x:0,y:HEADER_H,w:LEFT_W,h:AXIS_H,fill:{color:NAVY},line:{color:NAVY,width:1}});
    slide.addText('Projet / Groupe / Tâche',{x:0.05,y:HEADER_H,w:LABEL_W-0.05,h:AXIS_H,
      fontSize:7,fontFace:'Arial',color:'FFFFFF',bold:true,valign:'middle',margin:0});
    slide.addShape(pres.ShapeType.line,{x:LABEL_W,y:HEADER_H,w:0,h:AXIS_H,line:{color:'FFFFFF',width:0.5,transparency:60}});
    slide.addText('Début → Fin',{x:LABEL_W+0.02,y:HEADER_H,w:DATE_W-0.04,h:AXIS_H,
      fontSize:6.5,fontFace:'Arial',color:'FFFFFF',bold:true,valign:'middle',align:'center',margin:0});
    slide.addShape(pres.ShapeType.line,{x:LABEL_W+DATE_W,y:HEADER_H,w:0,h:AXIS_H,line:{color:'FFFFFF',width:0.5,transparency:60}});
    slide.addText('Ch.',{x:LABEL_W+DATE_W+0.02,y:HEADER_H,w:CHARGE_W-0.04,h:AXIS_H,
      fontSize:6.5,fontFace:'Arial',color:'FFFFFF',bold:true,valign:'middle',align:'center',margin:0});

    // Months axis
    slide.addShape(pres.ShapeType.rect,{x:CHART_X,y:HEADER_H,w:CHART_W,h:AXIS_H,fill:{color:NAVY},line:{color:NAVY,width:1}});
    monthsAxis.forEach(m=>{
      const mx=chartX(m.sOff), mw=Math.max(0.01,(m.eOff-m.sOff)*CHART_W);
      slide.addShape(pres.ShapeType.line,{x:mx,y:HEADER_H,w:0,h:AXIS_H,line:{color:'FFFFFF',width:0.5,transparency:70}});
      if(mw>0.12) slide.addText(m.label,{x:mx+0.02,y:HEADER_H,w:mw-0.02,h:AXIS_H,
        fontSize:6.5,fontFace:'Arial',color:'FFFFFF',valign:'middle',margin:0});
    });
    slide.addShape(pres.ShapeType.line,{x:0,y:HEADER_H+AXIS_H,w:SLIDE_W,h:0,line:{color:ACCENT,width:2}});

    // ── Rows ────────────────────────────────────────────────────────────
    pageRows.forEach((r, rowIdx)=>{
      const ry = TOP_Y + AXIS_H + rowIdx * ROW_H_IN;
      const isProj  = r._type==='projet';
      const isGrp   = r._type==='groupe';
      const isJalon = r._type==='jalon';
      const niv     = r.niveaux||[];
      const depth   = isGrp ? niv.length : 0;
      const barColor = isProj ? projectHex(r.projet)
                     : isGrp  ? lightenHex(projectHex(r.projet), depth*10)
                     : isJalon? hexNoHash(getColor(r.projet)||ACCENT)
                     : projectHex(r.projet);

      // Row background
      const rowFill = isProj  ? (isDark?'1c2d3f':'eef3f8')
                    : isGrp   ? (isDark?'1a2c3a':'f5f8fb')
                    : isJalon ? (isDark?'1e1800':'fff8f0')
                    : SURFACE;
      slide.addShape(pres.ShapeType.rect,{x:0,y:ry,w:SLIDE_W,h:ROW_H_IN,
        fill:{color:rowFill},line:{color:BORDER,width:0.5}});

      // ── Jalon ──────────────────────────────────────────────────────
      if(isJalon){
        // Label
        slide.addText('◆ '+( r.nom||''), {
          x:0.1,y:ry,w:LABEL_W-0.1,h:ROW_H_IN,
          fontSize:Math.max(5,ROW_H_IN*28),fontFace:'Arial',
          color:barColor,bold:true,italic:true,valign:'middle',margin:0
        });
        slide.addShape(pres.ShapeType.line,{x:LABEL_W,y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}});
        // Date du jalon dans colonne date
        slide.addText(fmtD(r.date),{
          x:LABEL_W+0.02,y:ry,w:DATE_W-0.04,h:ROW_H_IN,
          fontSize:Math.max(5,ROW_H_IN*26),fontFace:'Courier New',
          color:barColor,bold:true,valign:'middle',align:'center',margin:0
        });
        slide.addShape(pres.ShapeType.line,{x:LABEL_W+DATE_W,y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}});
        // Losange dans chart
        if(r.date){
          const jx = chartX(xOfDay(r.date));
          const s = Math.min(ROW_H_IN*0.38, 0.08);
          const cy = ry + ROW_H_IN/2;
          // Ligne verticale pointillée
          slide.addShape(pres.ShapeType.line,{x:jx,y:ry,w:0,h:ROW_H_IN,
            line:{color:barColor,width:1,dashType:'dash',transparency:40}});
          // Losange (approximation : petit carré tourné 45°)
          slide.addShape(pres.ShapeType.rect,{
            x:jx-s/2,y:cy-s/2,w:s,h:s,
            fill:{color:barColor},line:{color:barColor,width:1},rotate:45
          });
        }
        // Séparateurs mois
        monthsAxis.forEach(m=>slide.addShape(pres.ShapeType.line,
          {x:chartX(m.sOff),y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}}));
        if(todayInRange) slide.addShape(pres.ShapeType.line,
          {x:chartX(todayFrac),y:ry,w:0,h:ROW_H_IN,line:{color:ACCENT,width:1.5}});
        return;
      }

      // ── Projet / Groupe / Tâche ─────────────────────────────────────
      const baseIndent = isProj ? 0.08 : isGrp ? 0.12 + (depth-1)*0.12 : 0.28 + niv.length*0.10;
      const fs = Math.max(5.5, ROW_H_IN * (isProj?30:isGrp?28:26));

      // Icône niveau pour groupes
      let labelPrefix = '';
      if(isGrp){
        const icons=['◆','◇','▸','·','–'];
        labelPrefix = icons[Math.min(depth-1,icons.length-1)] + ' ';
      }
      const labelText = isProj ? r.projet
                      : isGrp  ? labelPrefix + (niv[niv.length-1]||'')
                      : (r.tache||'—');
      const labelColor = (isProj||isGrp) ? barColor : TEXT;

      slide.addText(labelText,{
        x:baseIndent,y:ry,w:LABEL_W-baseIndent-0.03,h:ROW_H_IN,
        fontSize:fs,fontFace:'Arial',color:labelColor,
        bold:isProj||isGrp,valign:'middle',margin:0
      });

      slide.addShape(pres.ShapeType.line,{x:LABEL_W,y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}});

      // Dates côte à côte : début → fin
      slide.addText([
        {text:fmtD(r.debut), options:{color:TEXT,fontSize:Math.max(5,fs-1)}},
        {text:'→',           options:{color:ACCENT,fontSize:Math.max(5,fs-1.5),bold:true}},
        {text:fmtD(r.fin),   options:{color:TEXT,fontSize:Math.max(5,fs-1)}}
      ],{x:LABEL_W+0.02,y:ry,w:DATE_W-0.04,h:ROW_H_IN,
        fontFace:'Courier New',valign:'middle',align:'center',margin:0});

      slide.addShape(pres.ShapeType.line,{x:LABEL_W+DATE_W,y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}});

      // Charge
      if(r.charge!=null){
        slide.addText(`${r.charge}j`,{
          x:LABEL_W+DATE_W+0.02,y:ry+Math.max(0.01,ROW_H_IN*0.15),
          w:CHARGE_W-0.04,h:ROW_H_IN*0.70,
          fontSize:Math.max(5,fs-1.5),fontFace:'Courier New',color:ACCENT,bold:true,
          align:'center',valign:'middle',margin:0,
          fill:{color:isDark?'2a2000':'fff3e0'},line:{color:ACCENT,width:0.5}
        });
      }

      // ── Gantt bar ────────────────────────────────────────────────────
      const bx = chartX(xOfDay(r.debut));
      const bw = barW(r.debut, r.fin);
      const BAR_H = isProj ? Math.max(0.04, ROW_H_IN*0.25)
                  : isGrp  ? Math.max(0.03, ROW_H_IN*0.20)
                  : Math.max(0.05, ROW_H_IN*0.55);
      const bary = ry + (ROW_H_IN - BAR_H) / 2;

      if(isProj){
        const spineY = bary + BAR_H/2 - 0.02;
        const hookH  = Math.max(0.06, ROW_H_IN*0.45);
        slide.addShape(pres.ShapeType.rect,{x:bx,y:spineY,w:bw,h:0.04,fill:{color:barColor},line:{color:barColor,width:1}});
        slide.addShape(pres.ShapeType.line,{x:bx,y:spineY,w:0,h:hookH,line:{color:barColor,width:2}});
        slide.addShape(pres.ShapeType.line,{x:bx,y:spineY+hookH,w:0.05,h:0,line:{color:barColor,width:2}});
        slide.addShape(pres.ShapeType.line,{x:bx+bw,y:spineY,w:0,h:hookH,line:{color:barColor,width:2}});
        slide.addShape(pres.ShapeType.line,{x:bx+bw-0.05,y:spineY+hookH,w:0.05,h:0,line:{color:barColor,width:2}});
      } else if(isGrp){
        const spineY = bary + BAR_H/2 - 0.015;
        const hookH  = Math.max(0.04, ROW_H_IN*0.35);
        slide.addShape(pres.ShapeType.rect,{x:bx,y:spineY,w:bw,h:0.025,fill:{color:barColor},line:{color:barColor,width:0.5}});
        slide.addShape(pres.ShapeType.line,{x:bx,y:spineY,w:0,h:hookH,line:{color:barColor,width:1.5}});
        slide.addShape(pres.ShapeType.line,{x:bx,y:spineY+hookH,w:0.04,h:0,line:{color:barColor,width:1.5}});
        slide.addShape(pres.ShapeType.line,{x:bx+bw,y:spineY,w:0,h:hookH,line:{color:barColor,width:1.5}});
        slide.addShape(pres.ShapeType.line,{x:bx+bw-0.04,y:spineY+hookH,w:0.04,h:0,line:{color:barColor,width:1.5}});
      } else {
        slide.addShape(pres.ShapeType.rect,{x:bx,y:bary,w:bw,h:BAR_H,
          fill:{color:barColor},line:{color:barColor,width:1},
          shadow:{type:'outer',color:'000000',blur:2,offset:1,angle:135,opacity:0.15}});
        if(r.charge!=null && bw>0.18){
          slide.addText(`${r.charge}j`,{x:bx,y:bary,w:bw,h:BAR_H,
            fontSize:Math.max(5,fs-2),fontFace:'Courier New',color:'FFFFFF',bold:true,
            align:'center',valign:'middle',margin:0});
        }
      }

      // Mois + today
      monthsAxis.forEach(m=>slide.addShape(pres.ShapeType.line,
        {x:chartX(m.sOff),y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}}));
      if(todayInRange) slide.addShape(pres.ShapeType.line,
        {x:chartX(todayFrac),y:ry,w:0,h:ROW_H_IN,line:{color:ACCENT,width:1.5}});
    });

    // Séparateur gauche/chart
    slide.addShape(pres.ShapeType.line,{x:LEFT_W,y:HEADER_H,w:0,h:SLIDE_H-HEADER_H,line:{color:BORDER,width:1}});
    if(todayInRange) slide.addShape(pres.ShapeType.line,
      {x:chartX(todayFrac),y:HEADER_H,w:0,h:AXIS_H,line:{color:ACCENT,width:2}});

    // Légende projets
    const projs=[...new Set(rows.filter(r=>r._type==='tache').map(r=>r.projet))];
    let lx=0.10;
    const legendY=SLIDE_H-0.16;
    projs.forEach(p=>{
      const ph=projectHex(p);
      slide.addShape(pres.ShapeType.rect,{x:lx,y:legendY+0.02,w:0.09,h:0.09,fill:{color:ph},line:{color:ph,width:1}});
      slide.addText(p,{x:lx+0.11,y:legendY,w:0.9,h:0.16,fontSize:6.5,fontFace:'Arial',color:TEXT,valign:'middle',margin:0});
      lx+=1.05;
    });

  }); // end pages

  pres.writeFile({fileName:`Gantt_4CAD_${view}_${new Date().toISOString().slice(0,10)}.pptx`});
}


  if(icon){
    icon.innerHTML=dataSectionOpen?'&#9660;':'&#9654;';
  }
}