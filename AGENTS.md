# Architecture rules
- Keep administrator roles in protected user_roles; route guards query the server and all privileged actions revalidate the caller server-side to prevent privilege escalation.
- Keep the seller-level administration UI separate from seller and buyer dashboards and use the existing rewards API for mutations to preserve server-owned scores and balances.