import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function allowed(email?: string | null) {
  return !!email && (process.env.FLOW_MANAGER_GUK_ADMIN_EMAILS || "")
    .split(",").map(x => x.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!url || !publishableKey || !secretKey) return NextResponse.json({error:"Server configuration missing."},{status:500});
  const token=request.headers.get("authorization")?.replace(/^Bearer /,"");
  const client=createClient(url,publishableKey);
  const {data}=token ? await client.auth.getUser(token) : {data:{user:null}};
  if(!allowed(data.user?.email)) return NextResponse.json({error:"GUK back office access required."},{status:403});

  const {id}=await params;
  const body=await request.json();
  const email=String(body.email||"").trim().toLowerCase();
  const role = ["admin","manager","viewer"].includes(body.role) ? body.role : "viewer";
  if(!email) return NextResponse.json({error:"Email address is required."},{status:400});

  const admin=createClient(url,secretKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const {data:org}=await admin.from("organizations").select("id").eq("id",id).single();
  if(!org) return NextResponse.json({error:"Customer not found."},{status:404});

  const {data:users}=await admin.auth.admin.listUsers({page:1,perPage:1000});
  const existing=users?.users.find(u=>u.email?.toLowerCase()===email);
  let userId=existing?.id;
  let invitationSent=false;

  if(!userId){
    const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin;
    const {data:invited,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:`${siteUrl}/auth/invite`});
    if(error||!invited.user) return NextResponse.json({error:error?.message||"Invitation failed."},{status:400});
    userId=invited.user.id;
    invitationSent=true;
  }

  const {error}=await admin.from("memberships").upsert(
    {org_id:id,user_id:userId,role},
    {onConflict:"org_id,user_id"}
  );
  if(error) return NextResponse.json({error:error.message},{status:500});

  const {data:memberships,error:membershipError}=await admin.from("memberships").select("user_id,role").eq("org_id",id);
  if(membershipError) return NextResponse.json({error:membershipError.message},{status:500});
  const result=await Promise.all((memberships||[]).map(async m=>{
    const {data}=await admin.auth.admin.getUserById(m.user_id);
    return {email:data.user?.email||"Unknown",role:m.role};
  }));
  return NextResponse.json({ok:true,invitationSent,users:result});
}
