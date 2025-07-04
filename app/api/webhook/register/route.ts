// app/api/webhooks/clerk/route.ts
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/Prisma";

export async function POST(req: Request): Promise<NextResponse> {
  console.log("🚀 Webhook endpoint hit!");
  
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
  
  console.log("🔑 Webhook secret exists:", !!WEBHOOK_SECRET);
  console.log("🔑 Webhook secret length:", WEBHOOK_SECRET?.length);
  
  if (!WEBHOOK_SECRET) {
    console.error("❌ Missing Clerk Webhook Secret");
    return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 });
  }

  try {
    // Read raw body
    const payload = await req.text();
    console.log("📦 Received payload length:", payload.length);
    console.log("📦 Payload preview:", payload.substring(0, 200) + "...");
    
    // Get headers
    const headerPayload = await headers();
    
    const svixHeaders = {
      "svix-id": headerPayload.get("svix-id") ?? "",
      "svix-timestamp": headerPayload.get("svix-timestamp") ?? "",
      "svix-signature": headerPayload.get("svix-signature") ?? "",
    };
    
    console.log("🔐 Headers received:", {
      id: svixHeaders["svix-id"],
      timestamp: svixHeaders["svix-timestamp"],
      signature: svixHeaders["svix-signature"] ? "present" : "missing",
      signatureLength: svixHeaders["svix-signature"]?.length
    });

    // Check if any headers are missing
    if (!svixHeaders["svix-id"] || !svixHeaders["svix-timestamp"] || !svixHeaders["svix-signature"]) {
      console.error("❌ Missing required headers");
      return NextResponse.json({ error: "Missing required headers" }, { status: 400 });
    }

    const wh = new Webhook(WEBHOOK_SECRET);
    
    let evt: WebhookEvent;
    try {
      console.log("🔍 Attempting to verify webhook...");
      evt = wh.verify(payload, svixHeaders) as WebhookEvent;
      console.log("✅ Webhook verified successfully!");
      console.log("📋 Event type:", evt.type);
      console.log("📋 Event data keys:", Object.keys(evt.data));
    } catch (err) {
      console.error("❌ Signature verification failed:", err);
      console.error("❌ Error details:", {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Handle the event
    if (evt.type === "user.created") {
      console.log("👤 Processing user.created event");
      const { id, email_addresses, first_name, last_name } = evt.data;
      
      console.log("👤 User data received:", {
        id,
        email_addresses: email_addresses?.map(e => e.email_address),
        first_name,
        last_name
      });
      
      const primaryEmail = email_addresses?.[0]?.email_address;
      
      if (!primaryEmail) {
        console.warn("⚠️ No primary email found in event");
        return NextResponse.json({ error: "Email not found in event" }, { status: 400 });
      }

      console.log("🔍 Checking if user exists in database...");
      
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });
      
      if (existingUser) {
        console.log("ℹ️ User already exists:", id);
        return NextResponse.json({ message: "User already exists" }, { status: 200 });
      }

      console.log("📝 Creating new user in database...");
      
      // Create new user
      const newUser = await prisma.user.create({
        data: {
          id,
          email: primaryEmail,
          isSubscribed: false,
          subscriptionEnds: new Date(),
        },
      });

      console.log("✅ User created in DB successfully:", newUser);
      
    } else if (evt.type === "user.updated") {
      console.log("👤 Processing user.updated event");
      const { id, email_addresses } = evt.data;
      const primaryEmail = email_addresses?.[0]?.email_address;
      
      if (primaryEmail) {
        await prisma.user.update({
          where: { id },
          data: {
            email: primaryEmail,
          },
        });
        console.log("✅ User updated in DB:", id);
      }
      
    } else if (evt.type === "user.deleted") {
      console.log("👤 Processing user.deleted event");
      const { id } = evt.data;
      
      await prisma.user.delete({
        where: { id },
      });
      console.log("✅ User deleted from DB:", id);
      
    } else {
      console.log("ℹ️ Unhandled event type:", evt.type);
    }

    console.log("🎉 Webhook processed successfully!");
    return NextResponse.json({ message: "Webhook processed successfully" }, { status: 200 });
    
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    console.error("❌ Error stack:", error instanceof Error ? error.stack : "No stack trace");
    return NextResponse.json({ 
      error: "Webhook processing error", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}

// Add a simple GET handler for testing
export async function GET() {
  console.log("📍 GET request to webhook endpoint");
  return NextResponse.json({ message: "Webhook endpoint is working" }, { status: 200 });
}