import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";

export async function POST() {
  try {
    const connectionToken = await stripe.terminal.connectionTokens.create();

    return NextResponse.json({
      secret: connectionToken.secret,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message ?? "Connection Token konnte nicht erstellt werden.",
      },
      { status: 500 }
    );
  }
}