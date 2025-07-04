// app/api/webhooks/clerk/route.ts
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/Prisma";

export async function POST(req: Request): Promise<NextResponse> {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
  
  if (!WEBHOOK_SECRET) {
    console.error("❌ Missing Clerk Webhook Secret");
    return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 });
  }

  try {
    // Read raw body
    const payload = await req.text();
    console.log("📦 Received payload length:", payload.length);
    
    // Get headers - await since headers() returns Promise in newer Next.js versions
    const headerPayload = await headers();
    
    const svixHeaders = {
      "svix-id": headerPayload.get("svix-id") ?? "",
      "svix-timestamp": headerPayload.get("svix-timestamp") ?? "",
      "svix-signature": headerPayload.get("svix-signature") ?? "",
    };
    
    console.log("🔐 Headers received:", {
      id: svixHeaders["svix-id"],
      timestamp: svixHeaders["svix-timestamp"],
      signature: svixHeaders["svix-signature"] ? "present" : "missing"
    });

    const wh = new Webhook(WEBHOOK_SECRET);
    
    let evt: WebhookEvent;
    try {
      evt = wh.verify(payload, svixHeaders) as WebhookEvent;
      console.log("✅ Webhook verified:", evt.type);
    } catch (err) {
      console.error("❌ Signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Handle the event
    if (evt.type === "user.created") {
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

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });
      
      if (existingUser) {
        console.log("ℹ️ User already exists:", id);
        return NextResponse.json({ message: "User already exists" }, { status: 200 });
      }

      // Create new user
      const newUser = await prisma.user.create({
        data: {
          id,
          email: primaryEmail,
          isSubscribed: false,
          subscriptionEnds: new Date(),
          // Add other fields if needed
          // firstName: first_name,
          // lastName: last_name,
        },
      });

      console.log("✅ User created in DB:", newUser);
      
    } else if (evt.type === "user.updated") {
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
      const { id } = evt.data;
      
      await prisma.user.delete({
        where: { id },
      });
      console.log("✅ User deleted from DB:", id);
      
    } else {
      console.log("ℹ️ Unhandled event type:", evt.type);
    }

    return NextResponse.json({ message: "Webhook processed successfully" }, { status: 200 });
    
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    return NextResponse.json({ 
      error: "Webhook processing error", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}