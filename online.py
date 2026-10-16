"""オンライン経路のE2E (偽Firebase)。ホスト+参加者の2タブで ルーム作成→参加→開始→最後まで対戦→ホスト再読込復元 を検証。
使い方: (リポジトリ直下で) python3 -m http.server 8765 &  python3 tests/e2e/online.py"""
import os, sys, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
FAKE = open(os.path.join(HERE, 'fake-firebase.js')).read()
CFG = "export const firebaseConfig={apiKey:'fake',authDomain:'x',databaseURL:'https://fake-default-rtdb.firebaseio.com',projectId:'x',appId:'x'};"
BASE = os.environ.get('BASE', 'http://localhost:8765')
errs = []

def step(pg, mine_only=True):
    """1操作ぶん進める。何かしたら True"""
    ov = pg.query_selector('.overlay .modal')
    if ov:
        if pg.query_selector('.modal.result'): return False
        if pg.query_selector('.modal [data-act=opt]'): pg.click('.modal [data-act=opt] >> nth=0'); return True
        if pg.query_selector('.modal [data-act=sel]'):
            for _ in range(8):
                if pg.query_selector('.modal [data-act=confirm]:not([disabled])'): break
                els = pg.query_selector_all('.modal [data-act=sel]:not(.sel)')
                if els: els[0].click()
            c = pg.query_selector('.modal [data-act=confirm]:not([disabled])')
            if c: c.click(); return True
            return False
        if pg.query_selector('.modal [data-act=confirm]'): pg.click('.modal [data-act=confirm]'); return True
        return False
    if not pg.query_selector('.banner.you'): return False
    if pg.query_selector('[data-act=pile]'): pg.click('[data-act=pile] >> nth=-1'); return True
    if pg.query_selector('[data-act=end]'):
        pl = pg.query_selector('.hand [data-act=play]')
        if pl: pl.click(); return True
        if pg.query_selector('[data-act=allT]'): pg.click('[data-act=allT]'); return True
        buy = pg.query_selector_all('.grid [data-act=buy]')
        if buy: buy[0 if len(buy) < 3 else -2].click(); return True
        pg.click('[data-act=end]'); return True
    return False

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium'))
    ctx = b.new_context(viewport={'width': 1100, 'height': 850})
    ctx.route('https://www.gstatic.com/firebasejs/**', lambda r: r.fulfill(status=200, content_type='text/javascript', body=FAKE))
    ctx.route('**/js/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=CFG))
    def mk(name):
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(f'{name}: {e}')); pg.on('console', lambda m: errs.append(f'{name}: {m.text}') if m.type == 'error' else None); return pg
    host = mk('host'); host.goto(BASE + '/index.html?fast=1'); host.wait_for_selector('.hero')
    host.fill('#name', 'ホスト'); host.click('text=ルームを作る'); host.wait_for_selector('.code')
    code = host.inner_text('.code').strip(); print('room', code)
    guest = mk('guest'); guest.goto(BASE + '/index.html'); guest.wait_for_selector('.hero')
    guest.fill('#name', 'ゲスト'); guest.fill('#code', code); guest.click('text=参加'); guest.wait_for_selector('.code')
    host.wait_for_function("document.querySelectorAll('.plist li').length===2")
    host.click('[data-act=kmode][data-v=random]')
    host.click('text=ゲーム開始'); 
    host.wait_for_selector('.handbar'); guest.wait_for_selector('.handbar')
    print('game started on both')
    t0 = time.time(); reloaded = False; n = 0
    while time.time() - t0 < 150:
        a = step(host); c = step(guest); n += a + c
        host.wait_for_timeout(60)
        if not reloaded and n > 40:
            host.reload(); host.wait_for_selector('.hero')   # ホスト再読込 → URLのroomから自動復帰して再開
            host.wait_for_selector('.handbar', timeout=15000); reloaded = True; print('host reloaded & resumed at step', n)
        if host.query_selector('.modal.result') and guest.query_selector('.modal.result'): break
    ok = host.query_selector('.modal.result') is not None and guest.query_selector('.modal.result') is not None
    print('finished on both:', ok, 'steps', n, 'secs', round(time.time() - t0))
    if ok: print(host.inner_text('.modal.result table').replace('\n', ' | '))
    host.screenshot(path=os.path.join(os.environ.get('SHOTS', '/tmp'), 'online_host.png'))
    # 非公開情報: 公開状態(pub)に手札のカードIDが含まれないこと
    tree = host.evaluate("JSON.parse(localStorage.getItem('fakefb_tree'))")
    room = tree['rooms'][code]; import json
    pub = json.loads(room['pub']); priv = {u: json.loads(v) for u, v in room['priv'].items()}
    leaked = [c for pv in priv.values() for c in pv['hand'] if f'"id":{c["id"]},"n"' in room['pub']]
    print('pub has hands:', bool(leaked), '| pub.players keys:', sorted(pub['players'][0].keys()))
    b.close()
print('ERRORS', errs)
sys.exit(0 if ok and not errs else 1)
