// app/api/webhook/register/route.ts
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/Prisma";

export async function POST(req: Request): Promise<NextResponse> {
  console.log("🚨 WEBHOOK HIT - POST REQUEST RECEIVED");
  console.log("⏰ Timestamp:", new Date().toISOString());
  
  // Log ALL environment variables (be careful in production)
  console.log("🔧 Environment check:");
  console.log("- NODE_ENV:", process.env.NODE_ENV);
  console.log("- WEBHOOK_SECRET exists:", !!process.env.WEBHOOK_SECRET);
  console.log("- WEBHOOK_SECRET length:", process.env.WEBHOOK_SECRET?.length);
  console.log("- DATABASE_URL exists:", !!process.env.DATABASE_URL);
  
  try {
    // Test database connection FIRST
    console.log("🔍 Testing database connection...");
    const dbTest = await prisma.$connect();
    console.log("✅ Database connected successfully");
    
    const payload = await req.text();
    console.log("📦 Payload received:");
    console.log("- Length:", payload.length);
    console.log("- First 500 chars:", payload.substring(0, 500));
    
    const headerPayload = await headers();
    
    // Log ALL headers
    console.log("📋 ALL HEADERS:");
    headerPayload.forEach((value, key) => {
      console.log(`- ${key}: ${value}`);
    });
    
    const svixHeaders = {
      "svix-id": headerPayload.get("svix-id") ?? "",
      "svix-timestamp": headerPayload.get("svix-timestamp") ?? "",
      "svix-signature": headerPayload.get("svix-signature") ?? "",
    };
    
    console.log("🔐 Svix headers extracted:");
    console.log("- svix-id:", svixHeaders["svix-id"]);
    console.log("- svix-timestamp:", svixHeaders["svix-timestamp"]);
    console.log("- svix-signature length:", svixHeaders["svix-signature"]?.length);
    
    if (!process.env.WEBHOOK_SECRET) {
      console.error("❌ WEBHOOK_SECRET is missing!");
      return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 });
    }
    
    console.log("🔑 Creating Webhook instance...");
    const wh = new Webhook(process.env.WEBHOOK_SECRET);
    
    console.log("🔍 Attempting webhook verification...");
    let evt: WebhookEvent;
    
    try {
      evt = wh.verify(payload, svixHeaders) as WebhookEvent;
      console.log("✅ WEBHOOK VERIFIED SUCCESSFULLY!");
      console.log("📋 Event details:");
      console.log("- Type:", evt.type);
      console.log("- Data keys:", Object.keys(evt.data));
      console.log("- Full event data:", JSON.stringify(evt.data, null, 2));
    } catch (verifyError) {
      console.error("❌ WEBHOOK VERIFICATION FAILED!");
      console.error("Error name:", verifyError instanceof Error ? verifyError.name : "Unknown");
      console.error("Error message:", verifyError instanceof Error ? verifyError.message : String(verifyError));
      console.error("Error stack:", verifyError instanceof Error ? verifyError.stack : "No stack");
      
      return NextResponse.json({ 
        error: "Webhook verification failed", 
        details: verifyError instanceof Error ? verifyError.message : String(verifyError)
      }, { status: 400 });
    }
    
    // Handle events
    if (evt.type === "user.created") {
      console.log("👤 Processing user.created event");
      
      const userData = evt.data;
      console.log("👤 Raw user data:", JSON.stringify(userData, null, 2));
      
      const { id, email_addresses, first_name, last_name } = userData;
      
      if (!id) {
        console.error("❌ No user ID in event data");
        return NextResponse.json({ error: "No user ID" }, { status: 400 });
      }
      
      if (!email_addresses || !Array.isArray(email_addresses) || email_addresses.length === 0) {
        console.error("❌ No email addresses in event data");
        return NextResponse.json({ error: "No email addresses" }, { status: 400 });
      }
      
      const primaryEmail = email_addresses[0]?.email_address;
      
      if (!primaryEmail) {
        console.error("❌ No primary email address found");
        return NextResponse.json({ error: "No primary email" }, { status: 400 });
      }
      
      console.log("📧 Primary email:", primaryEmail);
      
      // Check if user exists
      console.log("🔍 Checking if user exists...");
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });
      
      if (existingUser) {
        console.log("ℹ️ User already exists:", existingUser);
        return NextResponse.json({ message: "User already exists" }, { status: 200 });
      }
      
      // Create user
      console.log("📝 Creating new user...");
      const newUser = await prisma.user.create({
        data: {
          id,
          email: primaryEmail,
          isSubscribed: false,
          subscriptionEnds: new Date(),
        },
      });
      
      console.log("✅ USER CREATED SUCCESSFULLY!");
      console.log("New user:", JSON.stringify(newUser, null, 2));
      
      return NextResponse.json({ 
        message: "User created successfully", 
        userId: newUser.id 
      }, { status: 200 });
      
    } else {
      console.log("ℹ️ Unhandled event type:", evt.type);
      return NextResponse.json({ 
        message: "Event received but not handled", 
        eventType: evt.type 
      }, { status: 200 });
    }
    
  } catch (error) {
    console.error("🚨 CRITICAL ERROR:");
    console.error("Error name:", error instanceof Error ? error.name : "Unknown");
    console.error("Error message:", error instanceof Error ? error.message : String(error));
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack");
    
    return NextResponse.json({ 
      error: "Critical error", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

// Keep the GET handler for testing
export async function GET() {
  console.log("📍 GET request to webhook endpoint");
  
  try {
    // Test database
    await prisma.$connect();
    const userCount = await prisma.user.count();
    
    return NextResponse.json({ 
      message: "Webhook endpoint is working",
      database: "connected",
      userCount,
      env: {
        hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
        webhookSecretLength: process.env.WEBHOOK_SECRET?.length,
        hasDatabaseUrl: !!process.env.DATABASE_URL
      }
    });
  } catch (error) {
    return NextResponse.json({ 
      message: "Webhook endpoint is working",
      database: "error",
      error: error instanceof Error ? error.message : String(error)
    }, { status: 200 });
  }
}