import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getInstagramOauthStartUrl } from "@/lib/services/instagram-service";

export async function GET() {
  try {
    return NextResponse.redirect(getInstagramOauthStartUrl());
  } catch (error) {
    const message = encodeURIComponent(error instanceof AppError ? error.message : toErrorMessage(error));
    return NextResponse.redirect(`${process.env.APP_URL ?? "http://localhost:3000"}/settings?instagram_error=${message}`);
  }
}
