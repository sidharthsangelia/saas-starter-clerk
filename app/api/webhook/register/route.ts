import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/Prisma";

export async function POST(req: Request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return new Response("Missing secret", { status: 500 });

  const wh = new Webhook(secret);
  const body = await req.text();
  const headerPayload = await headers();

let event: WebhookEvent;
try {
  event = wh.verify(body, {
    "svix-id": headerPayload.get("svix-id")!,
    "svix-timestamp": headerPayload.get("svix-timestamp")!,
    "svix-signature": headerPayload.get("svix-signature")!,
  }) as WebhookEvent;
} catch (err) {
  console.error("Webhook verification failed:", err);
  return new Response("Invalid webhook signature", { status: 400 });
}


  try {
    if (event.type === "user.created") {
      const { id, email_addresses, first_name, last_name } = event.data;
      await prisma.user.upsert({
        where: { id: id },
        update: {},
        create: {
          id: id,
          email: email_addresses[0].email_address,
          isSubscribed: false, // Default setting
          subscriptionEnds: new Date(),
        },
      });
    }
  } catch (error) {
    console.error("Error creating user in database:", error);
    return new Response("Error creating user", { status: 500 });
  }

return new Response("Webhook received successfully", { status: 200 });
}
