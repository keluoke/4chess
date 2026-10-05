"""Build the standalone reading document from content.json and styles.css."""
import json
from pathlib import Path
from html import escape as esc

ROOT = Path(__file__).resolve().parent
data = json.loads((ROOT / 'content.json').read_text())

def text(s):
    return esc(s)

def logo():
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 57V34C32 22 18 25 11 10M32 34C32 22 46 25 53 10M11 10H25M11 10V24M53 10H39M53 10V24" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

def arrow(tone):
    color = '#a66a24' if tone == 'gold' else '#285a46'
    dash = '' if tone == 'gold' else 'stroke-dasharray="13 9"'
    return f'<svg viewBox="0 0 160 65" aria-hidden="true"><path d="M6 33H133" fill="none" stroke="{color}" stroke-width="6" {dash}/><path d="M128 18L149 33L128 48" fill="none" stroke="{color}" stroke-width="6" stroke-linejoin="round"/></svg>'

def heatmap():
    cells = ''.join(f'<rect x="{c*36}" y="{r*36}" width="34" height="34" fill="{col}"/>' for r,row in enumerate([['#d5ddca','#d5ddca','#d5ddca','#d5ddca'],['#d5ddca','#d6b573','#d5ddca','#d5ddca'],['#b7c6a3','#c99945','#e2b36b','#d5ddca'],['#d5ddca','#d6b573','#d5ddca','#d5ddca']]) for c,col in enumerate(row))
    return f'<svg viewBox="0 0 144 144" role="img" aria-label="候选落点概率热力图的概念示意">{cells}</svg>'

def cover_art():
    cells = ''.join(f'<rect x="{x*40+20}" y="{y*40+15}" width="40" height="40" fill="{["#e3e4d5","#b3c3ac"][(x+y)%2]}"/>' for x in range(8) for y in range(8))
    return f'<div class="cover-art"><svg viewBox="0 0 390 350" role="img" aria-label="棋盘上的两条分岔路径，象征人类直觉与搜索建议"><defs><marker id="hero-gold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#a66a24"/></marker><marker id="hero-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#285a46"/></marker></defs>{cells}<path d="M180 295V202Q180 172 128 150L74 94" stroke="#a66a24" stroke-width="9" fill="none" marker-end="url(#hero-gold)"/><path d="M180 295V202Q180 172 232 150L290 94" stroke="#285a46" stroke-width="9" stroke-dasharray="14 9" fill="none" marker-end="url(#hero-green)"/><circle cx="180" cy="295" r="12" fill="#203d32"/></svg><div class="branch-words"><span class="gold">人类直觉<b>这步很自然。</b></span><br><span class="green">引擎搜索<b>还有另一条路。</b></span></div></div>'

# Original vector chess-piece drawings; no external fonts/images needed for boards.
def piece(kind, white):
    drawings = {
      'p':'<circle cx="30" cy="16" r="8"/><path d="M25 25H35L39 42H21Z"/><path d="M18 45H42L45 51H15Z"/>',
      'r':'<path d="M15 12H23V19H28V12H34V19H39V12H46V26H40L38 44H22L20 26H15Z"/><path d="M18 45H42L46 51H14Z"/>',
      'n':'<path d="M20 44Q17 34 31 27L18 28L14 23L21 15L30 13L31 8L38 14Q49 24 43 44Z"/><circle cx="30" cy="19" r="1.9" fill="'+ ('#203d32' if white else '#f5f2e9') +'" stroke="none"/><path d="M17 45H44L47 51H14Z"/>',
      'b':'<path d="M30 8Q13 19 25 29L20 44H40L35 29Q47 19 30 8Z"/><path d="M30 13L35 22" fill="none"/><path d="M17 45H43L46 51H14Z"/>',
      'q':'<circle cx="12" cy="13" r="3"/><circle cx="30" cy="8" r="3"/><circle cx="48" cy="13" r="3"/><path d="M12 16L18 36H42L48 16L37 24L30 12L23 24Z"/><path d="M20 39H40L43 45H17Z"/><path d="M15 47H45L47 52H13Z"/>',
      'k':'<path d="M28 5H32V11H38V15H32V22H28V15H22V11H28Z"/><path d="M29 24Q18 15 16 27Q14 35 22 42H38Q46 35 44 27Q42 15 31 24Z"/><path d="M19 44H41L46 52H14Z"/>'
    }
    return f'<g fill="{"#fffdf5" if white else "#203d32"}" stroke="{"#203d32" if white else "#f5f2e9"}" stroke-width="1.8" stroke-linejoin="round">{drawings[kind]}</g>'

def board(fen):
    squares=''.join(f'<rect x="{x*60+32}" y="{y*60+10}" width="60" height="60" fill="{["#e7e6d5","#9ab398"][(x+y)%2]}"/>' for y in range(8) for x in range(8))
    pieces=[]
    for y,row in enumerate(fen.split()[0].split('/')):
        x=0
        for char in row:
            if char.isdigit(): x+=int(char)
            else:
                pieces.append(f'<g transform="translate({x*60+32},{y*60+10})">{piece(char.lower(),char.isupper())}</g>')
                x+=1
    labels=''.join(f'<text x="{i*60+62}" y="519" text-anchor="middle">{c}</text>' for i,c in enumerate('abcdefgh'))+''.join(f'<text x="14" y="{i*60+49}" text-anchor="middle">{8-i}</text>' for i in range(8))
    return f'<svg class="board" viewBox="0 0 532 532" role="img" aria-label="白方走完 f3 和 g4 后的教学局面。黑后从 d8 到 h4 可将杀，黑马也可从 b8 到 c6。"><defs><marker id="case-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#285a46"/></marker><marker id="case-gold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#a66a24"/></marker></defs>{squares}{"".join(pieces)}<path d="M243 41L472 270" stroke="#285a46" stroke-width="8" stroke-dasharray="12 7" fill="none" marker-end="url(#case-green)"/><path d="M122 47V103H182V153" stroke="#a66a24" stroke-width="6" fill="none" marker-end="url(#case-gold)"/><g fill="#677268" font-family="sans-serif" font-size="21">{labels}</g></svg>'

def row(r,i=None,kind='plain'):
    before = f'<div class="row-number">0{i+1}</div>' if kind=='number' else f'<div class="arrow-key">{arrow(r["tone"])}</div>' if kind=='arrow' else ''
    cls = 'label-block' if kind=='label' else 'view-row'
    return f'<div class="{cls} tone-{r["tone"]}">{before}<div><p class="row-tag">{text(r["tag"])}</p><h3 class="row-name">{text(r["name"])}</h3><p class="row-text">{text(r["text"])}</p></div></div>'

def state_icon(i):
    paths=['<circle cx="30" cy="30" r="21"/><path d="M30 16V30L39 36"/>','<rect x="13" y="25" width="34" height="27" rx="3"/><path d="M20 25V17A10 10 0 0 1 40 17V25M30 34V43"/>','<path d="M9 31L24 45L51 15"/>']
    return f'<svg class="state-icon" viewBox="0 0 60 60" fill="none" stroke="#e0bb72" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths[i]}</svg>'

def render(p,i):
    layout=p['layout']
    title='h1' if i==0 else 'h2'
    body=f'<p class="kicker">{text(p["kicker"])}</p><{title}>{"".join("<span>"+text(t)+"</span>" for t in p["title"])}</{title}><p class="intro">{text(p["intro"])}</p>'
    if layout=='cover': body+=f'<p class="lead">{text(p["lead"])}</p>'+cover_art()
    elif layout=='views': body+='<div class="rows">'+''.join(row(r,j,'number') for j,r in enumerate(p['rows']))+'</div>'
    elif layout=='legend': body+='<div class="rows">'+''.join(row(r,kind='arrow') for r in p['rows'])+'</div>'+f'<div class="heat-block">{heatmap()}<div><h3>落点概率热力图</h3><p>{text(p["heat"])}</p></div></div>'
    elif layout=='example': body+=f'<div class="example-visual"><div>{board(p["fen"])}<p class="board-caption">黑方走 · 先找将军、吃子、威胁</p></div><div class="rows">'+''.join(row(r) for r in p['rows'])+'</div></div>'
    elif layout=='labels': body+='<div class="rows">'+''.join(row(r,kind='label') for r in p['rows'])+'</div>'
    elif layout=='workflow': body+='<div class="steps">'+''.join(f'<div class="step"><div class="step-num">{j+1}</div><div><h3>{text(s["name"])}</h3><p>{text(s["text"])}</p></div></div>' for j,s in enumerate(p['steps']))+'</div>'
    elif layout=='fairplay': body+='<div class="stages">'+''.join(f'<div class="stage">{state_icon(j)}<div><h3>{text(s["name"])}</h3><p>{text(s["text"])}</p></div></div>' for j,s in enumerate(p['stages']))+'</div>'
    elif layout=='checklist': body+='<ul>'+''.join(f'<li>{text(s)}</li>' for s in p['checks'])+'</ul>'+f'<div class="setup"><h3>{text(p["cta"])}</h3><p>{text(p["setup"])}</p></div>'
    body+=f'<p class="takeaway">{text(p["takeaway"])}</p>'
    if 'note' in p: body+=f'<p class="note">{text(p["note"])}</p>'
    return f'<article class="page {layout}" id="{p["id"]}" aria-label="第{i+1}页：{"，".join(p["title"])}"><header class="page-header"><span class="brand">{logo()}{text(data["meta"]["brand"])}</span><span class="series">{text(data["meta"]["series"])}</span></header><div class="body">{body}</div><footer class="page-footer"><div class="footer-info"><span>{text(data["meta"]["signature"])}</span><span>{text(p["source"])}</span></div><span class="page-number">{i+1:02d} <small>/ 08</small></span></footer></article>'

sources=''.join(f'<div class="source-entry"><b>[{s["id"]}] '+(f'<a href="{s["url"]}">{text(s["title"])}</a>' if s['url'] else text(s['title']))+f'</b><p>{text(s["detail"])}</p></div>' for s in data['sources'])
html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="歧路：把实战着法、Maia 人类走法预测与 Stockfish 搜索建议放在同一张棋盘上。8 页图文介绍与复盘训练方法。"><title>我给自己做了个 Chrome 里的国际象棋对比引擎 · 歧路</title><script>if(new URLSearchParams(location.search).has("export"))document.documentElement.classList.add("export")</script><style>'+(ROOT/'styles.css').read_text()+'</style></head><body><nav class="toolbar" aria-label="作品导航"><span>8 页复盘笔记 · 网页文字可选择</span><a href="#sources">查看来源 ↗</a></nav><main class="pages">'+''.join(render(p,i) for i,p in enumerate(data['pages']))+'</main><aside class="sources" id="sources"><h2>来源与编辑说明</h2><p>核对日期：2026-10-03。数字与模型概念以来源为准，产品描述基于当前项目源码。</p>'+sources+'<p class="editorial">核心观点：'+text(data['meta']['core'])+'<br>第 6、8 页的手动练法是编辑建议，未经过涨分效果实验；不承诺提升等级分。本作品与导出图片共享同一份内容数据和 SVG 图形。</p></aside></body></html>'
(ROOT/'index.html').write_text(html)
print('Built index.html: 8 pages; embedded CSS and SVG; no external assets.')
