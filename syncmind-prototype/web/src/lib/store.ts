const globalForStore = global as unknown as { meetings: any[] };

export const meetings = globalForStore.meetings || [];

if (process.env.NODE_ENV !== "production") {
    globalForStore.meetings = meetings;
}
