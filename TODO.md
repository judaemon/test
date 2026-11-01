# TODO

- **Rename "flowers" to something broader.** The flowers list (Admin → Flowers,
  the `flowers` and `flower_colors` tables, `FlowerRecord`, recipe `flower`
  fields) also holds greenery like Eucalyptus and Ornamental asparagus, which
  aren't flowers. Pick a word that covers both (e.g. "stems" or "ingredients")
  and rename the admin page, shop copy, tables and types together.
- **Send email, and verify accounts.** The app can't send email yet: it needs a
  provider (e.g. Resend or Postmark) and a verified sender address.
  - Order emails: checkout already collects an address (`orders.email`). Send
    the order details, then restore the commented-out note under the Email
    field in `src/routes/checkout.tsx`.
  - Account verification: confirm a customer's email when they sign up, using
    Better Auth's `emailVerification` and `requireEmailVerification` options.
    Password reset by email would use the same setup.
