export async function latestRelease(env){
  const row=await env.DB.prepare("SELECT version FROM app_releases WHERE app = ?").bind('chrome-sidebar').first();
  return Response.json(row?{version:row.version}:{error:'No release published.'},{status:row?200:404,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
