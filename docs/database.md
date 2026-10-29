Concept Explanation
@id Defines the primary key
@unique Prevents duplicate values
String? Optional text field
Profile[] Represents multiple related profiles
@relation Defines how two models connect
onDelete: Cascade Deletes dependent records when the parent is deleted

Authentication and ownership: The User model stores login credentials and account roles. The Profile model stores public-facing business card information. A user can manage multiple profiles, and a profile may exist without an assigned user. Backend authorization will ensure customers can edit only their assigned profiles.

Migration: Prisma migrations translate our schema into PostgreSQL tables. migrate dev applies schema changes during development, while prisma generate generates the client used by our backend to query the database.

Problem: Prisma generated TypeScript syntax inside files with .js extensions, causing Node.js to throw a syntax error.

Solution: Switched to the prisma-client-js generator and imported PrismaClient from @prisma/client.

Lesson: A .js filename does not automatically make TypeScript code executable JavaScript. The generated code must be compatible with the application's runtime.
