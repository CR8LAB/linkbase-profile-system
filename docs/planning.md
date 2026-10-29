# Full-Stack Project — 01: Planning

## Project Information

**Project:** LinkBase Profile Editor  
**Version:** MVP 1.0  
**Architecture:** React + Express + Prisma + PostgreSQL

## 1. Problem Statement

Existing digital business cards use individually hard-coded HTML files. Creating and updating profiles requires editing source code.

The new application must allow administrators to create profiles through a dashboard and customers to update their own information without modifying source code.

## 2. User Roles

**Administrator**

- Create companies and profiles
- Configure branding and layouts
- Create customer login accounts
- Assign profiles to customers
- View scan analytics
- Manage Google Wallet integration

**Customer**

- Log in securely
- Edit permitted contact details and links
- View their own scan analytics
- Cannot modify branding or other customers' profiles

**Public Visitor**

- View a profile without logging in
- Save contact details as a VCF file
- Add a supported pass to Google Wallet
- Access social and contact links

## 3. Technology Stack

- Frontend: React + Vite + Bootstrap 5
- Backend: Node.js + Express
- ORM: Prisma
- Database: Neon PostgreSQL
- Authentication: JWT + bcrypt
- Storage: Google Cloud Storage
- Hosting: Vercel + Render
- Wallet: Google Wallet API

## 4. Public URL Structure

`https://linktags.linkbase.co.za/LB0011`

Each profile has a permanent, unique public identifier.

## 5. MVP Completion Criteria

- [ ] Administrator can log in
- [ ] Administrator can create a company
- [ ] Administrator can create a profile
- [ ] Public profile loads dynamically
- [ ] Customer can log in
- [ ] Customer can edit permitted information
- [ ] Company branding displays correctly
- [ ] Profile visits are recorded
- [ ] Scan analytics are visible
- [ ] VCF contact download works
- [ ] Google Wallet integration is tested
- [ ] Application is deployed

## 6. Development Rules

1. Understand each file before writing code.
2. Develop and test one feature at a time.
3. Keep secrets in environment variables.
4. Never trust frontend permissions alone.
5. Test API endpoints before frontend integration.
6. Document errors and their solutions.
7. Commit working milestones to Git.
8. Do not add unnecessary features before MVP completion.
