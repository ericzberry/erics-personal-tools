// ezberry.net — the public face of a private set of tools. Three pages: a home
// page and the two documents Google's OAuth consent screen links to. Static
// HTML from a Worker with no bindings, no cookies, and no request body ever
// read; everything that touches data stays behind tools.ezberry.net.

const UPDATED='11 September 2026';

const STYLE=`
:root{--paper:#f7f6f2;--surface:#fffefa;--ink:#203b33;--muted:#626f67;--forest:#173e37;--sage:#e8eee5;--line:#dedfd5;--accent:#ad8050;color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-text-size-adjust:100%}
main{max-width:36rem;margin:0 auto;padding:40px 20px 48px}
h1{margin:0 0 4px;font-family:Georgia,serif;font-weight:500;font-size:28px;letter-spacing:-.3px;color:var(--forest)}
h2{margin:20px 0 4px;font-family:Georgia,serif;font-weight:500;font-size:17px;color:var(--forest)}
p{margin:0 0 10px}
.sub{margin:0 0 18px;font-size:13px;color:var(--muted)}
ul{margin:0 0 10px;padding-left:20px}
li{margin:2px 0}
a{color:var(--forest);text-decoration-color:var(--line);text-underline-offset:2px}
a:hover{color:var(--accent);text-decoration-color:currentColor}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
code{padding:1px 4px;border-radius:4px;background:var(--sage);font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
nav{display:flex;flex-wrap:wrap;gap:14px;margin-top:26px;padding-top:12px;border-top:1px solid var(--line);font-size:13px}
@media (max-width:480px){main{padding:26px 16px 36px}h1{font-size:24px}}`;

const page=(title,body)=>`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`;

const nav=links=>`<nav>${links.map(([href,text])=>`<a href="${href}">${text}</a>`).join('')}</nav>`;

const HOME=page('Eric’s Tools',`
<h1>Eric’s Tools</h1>
<p class="sub">A private set of personal tools, built and used by one person.</p>
<p>Nothing here to sign up for: the tools have one user, their owner.</p>
${nav([['/privacy','Privacy'],['/terms','Terms']])}`);

const PRIVACY=page('Privacy — Eric’s Tools',`
<h1>Privacy</h1>
<p class="sub">Last updated ${UPDATED}</p>
<p>Eric’s Tools has one user: its owner. There are no accounts and nothing
offered to the public.</p>
<p>With the owner’s permission the app connects to Google Drive, and uses that
access only to file documents into a folder in the owner’s own Drive. The
connection is stored encrypted, and removing it in the app or at
<a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>
ends the access.</p>
<p>No analytics, no advertising, no tracking, nothing shared or sold, and no
cookies on these pages. Use of Google APIs follows the
<a href="https://developers.google.com/terms/api-services-user-data-policy">Google
API Services User Data Policy</a>, including the Limited Use requirements.</p>
${nav([['/','Home'],['/terms','Terms']])}`);

const TERMS=page('Terms — Eric’s Tools',`
<h1>Terms of service</h1>
<p class="sub">Last updated ${UPDATED}</p>
<p>Eric’s Tools is built for its owner’s own use. It is not a service offered
to anyone else, and there is no sign-up, subscription or support.</p>
<p>It is provided as is, without warranty of any kind, and may change or stop at
any time.</p>
<p>A Google account is touched only after its owner connects it — see
<a href="/privacy">Privacy</a>.</p>
${nav([['/','Home'],['/privacy','Privacy']])}`);

const MISSING=page('Not found — Eric’s Tools',`
<h1>Not found</h1>
${nav([['/','Home'],['/privacy','Privacy'],['/terms','Terms']])}`);

const PAGES={'/':HOME,'/privacy':PRIVACY,'/terms':TERMS};

const HEADERS={
  'content-type':'text/html; charset=utf-8',
  'cache-control':'public, max-age=600',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'"
};

const send=(body,status,method,extra={})=>new Response(method==='HEAD'?null:body,{status,headers:{...HEADERS,...extra}});

export default{
  fetch(request){
    const method=request.method;
    if(method!=='GET'&&method!=='HEAD')return send('Method not allowed\n',405,method,{allow:'GET, HEAD','content-type':'text/plain; charset=utf-8'});

    const url=new URL(request.url);
    // One address for the site: www and any trailing slash land on the canonical
    // path, so the links given to Google keep answering whatever gets typed.
    if(url.hostname.startsWith('www.'))
      return Response.redirect(`https://${url.hostname.slice(4)}${url.pathname}${url.search}`,301);

    const path=url.pathname.toLowerCase().replace(/\/+$/,'')||'/';
    if(path==='/robots.txt')return send('User-agent: *\nAllow: /\n',200,method,{'content-type':'text/plain; charset=utf-8'});
    if(path!==url.pathname&&PAGES[path])return Response.redirect(`${url.origin}${path}${url.search}`,301);

    const body=PAGES[path];
    return body?send(body,200,method):send(MISSING,404,method,{'cache-control':'no-store'});
  }
};
