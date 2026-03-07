import { NextResponse } from "next/server";
import { meetings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // Convert store directly 
    const meeting = meetings.find(m => m.id === id);

    if (!meeting) {
        return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    return NextResponse.json(meeting);
}
