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

  // Read raw body and headers (do not use req.json())
  const payload = await req.text();
  const headerPayload = await headers(); // ✅ Correct usage (no await)

  const svixHeaders = {
    "svix-id": headerPayload.get("svix-id") ?? "",
    "svix-timestamp": headerPayload.get("svix-timestamp") ?? "",
    "svix-signature": headerPayload.get("svix-signature") ?? "",
  };

  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;
  try {
    evt = wh.verify(payload, svixHeaders) as WebhookEvent;
    console.log("✅ Webhook verified:", evt.type);
  } catch (err) {
    console.error("❌ Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (evt.type === "user.created") {
      const { id, email_addresses } = evt.data;
      const email = email_addresses?.[0]?.email_address;

      if (!email) {
        console.warn("⚠️ Email missing in event");
        return NextResponse.json({ error: "Email not found in event" }, { status: 400 });
      }

      await prisma.user.upsert({
        where: { id },
        update: {},
        create: {
          id,
          email,
          isSubscribed: false,
          subscriptionEnds: new Date(),
        },
      });

      console.log("✅ User created in DB:", id);
    } else {
      console.log("ℹ️ Unhandled event type:", evt.type);
    }
  } catch (error) {
    console.error("❌ Error handling webhook:", error);
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }

  return NextResponse.json({ message: "Webhook received" }, { status: 200 });
}
