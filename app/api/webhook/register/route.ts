// app/api/webhook/register/route.ts
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/Prisma";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // Get the payload and headers
    const payload = await req.text();
    const headerPayload = await headers();
    
    const svixHeaders = {
      "svix-id": headerPayload.get("svix-id") ?? "",
      "svix-timestamp": headerPayload.get("svix-timestamp") ?? "",
      "svix-signature": headerPayload.get("svix-signature") ?? "",
    };
    
    // Verify webhook secret exists
    if (!process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 });
    }
    
    // Verify the webhook
    const wh = new Webhook(process.env.WEBHOOK_SECRET);
    let evt: WebhookEvent;
    
    try {
      evt = wh.verify(payload, svixHeaders) as WebhookEvent;
    } catch (verifyError) {
      return NextResponse.json({ 
        error: "Webhook verification failed", 
        details: verifyError instanceof Error ? verifyError.message : String(verifyError)
      }, { status: 400 });
    }
    
    // Handle user creation events
    if (evt.type === "user.created") {
      const { id, email_addresses, first_name, last_name } = evt.data;
      
      // Validate required data
      if (!id) {
        return NextResponse.json({ error: "No user ID provided" }, { status: 400 });
      }
      
      if (!email_addresses || !Array.isArray(email_addresses) || email_addresses.length === 0) {
        return NextResponse.json({ error: "No email addresses provided" }, { status: 400 });
      }
      
      const primaryEmail = email_addresses[0]?.email_address;
      if (!primaryEmail) {
        return NextResponse.json({ error: "No primary email found" }, { status: 400 });
      }
      
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });
      
      if (existingUser) {
        return NextResponse.json({ message: "User already exists" }, { status: 200 });
      }
      
      // Create new user
      const newUser = await prisma.user.create({
        data: {
          id,
          email: primaryEmail,
          isSubscribed: false,
          subscriptionEnds: new Date(),
        },
      });
      
      return NextResponse.json({ 
        message: "User created successfully", 
        userId: newUser.id 
      }, { status: 200 });
    }
    
    // Handle other event types
    return NextResponse.json({ 
      message: "Event received but not handled", 
      eventType: evt.type 
    }, { status: 200 });
    
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

 