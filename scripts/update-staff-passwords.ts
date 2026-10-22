import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import { staffUsers } from "../src/server/db/schema";

async function updatePasswords() {
  console.log("Updating staff passwords for manager and kitchen...");

  const managerHash = await bcrypt.hash("manager@123", 10);
  const kitchenHash = await bcrypt.hash("kitchen@123", 10);

  // 1. Update manager
  const managerResult = await db
    .update(staffUsers)
    .set({
      passwordHash: managerHash,
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(staffUsers.username, "manager"))
    .returning({ id: staffUsers.id, username: staffUsers.username, role: staffUsers.role });

  console.log(`Updated manager account (${managerResult.length} rows updated):`, managerResult);

  // Also update owner if present
  const ownerResult = await db
    .update(staffUsers)
    .set({
      passwordHash: managerHash,
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(staffUsers.username, "owner"))
    .returning({ id: staffUsers.id, username: staffUsers.username, role: staffUsers.role });

  if (ownerResult.length > 0) {
    console.log(`Updated owner account (${ownerResult.length} rows updated):`, ownerResult);
  }

  // 2. Update kitchen
  const kitchenResult = await db
    .update(staffUsers)
    .set({
      passwordHash: kitchenHash,
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(staffUsers.username, "kitchen"))
    .returning({ id: staffUsers.id, username: staffUsers.username, role: staffUsers.role });

  console.log(`Updated kitchen account (${kitchenResult.length} rows updated):`, kitchenResult);

  console.log("\nPassword update complete:");
  console.log("- Manager username: manager  | Password: manager@123");
  console.log("- Kitchen username: kitchen  | Password: kitchen@123");
  process.exit(0);
}

updatePasswords().catch((err) => {
  console.error("Failed to update passwords:", err);
  process.exit(1);
});
