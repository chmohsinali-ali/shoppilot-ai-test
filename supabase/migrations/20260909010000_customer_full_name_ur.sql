/*
# ShopPilot AI — Canonical Urdu spelling for a customer's Full Name

1. Purpose
The simplified Add/Edit Customer form's Full Name field now offers
autocomplete suggestions from the existing ~5,000-name reference
directory (already used for AI spelling correction — see
supabase/functions/ai-assistant/masterNameDictionary.json /
nameDictionary.ts). When the shopkeeper picks a suggestion, both the
canonical English spelling (already stored in full_name) and its
canonical Urdu spelling need to be saved — there was previously no
column to hold the latter.

2. Design
`full_name_ur` is purely a reference/display field, exactly like the
name directory itself — nullable, never required, never used for
duplicate detection or identity (that stays English full_name +
phone number, per existing partyValidation.ts rules). Existing rows
simply get null here; nothing is backfilled or guessed.
*/

alter table customers add column if not exists full_name_ur text;
