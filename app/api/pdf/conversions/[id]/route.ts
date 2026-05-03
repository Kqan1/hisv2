import { NextRequest, NextResponse } from "next/server";
import { getConversion, deleteConversion } from "@/lib/pdf-store";

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const conversion = await getConversion(id);

        if (!conversion) {
            return NextResponse.json({ error: "Conversion not found" }, { status: 404 });
        }

        return NextResponse.json(conversion);
    } catch (error) {
        console.error("Error fetching conversion:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const deleted = await deleteConversion(id);

        if (!deleted) {
            return NextResponse.json({ error: "Conversion not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting conversion:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
