# Backup & Restore — ShopPilot AI

ShopPilot AI uses Supabase (PostgreSQL) as its database. This document covers how to back up and restore your data.

## Supabase Dashboard Backups

### Automatic Backups

Supabase provides automatic daily backups on Pro plans and above. These backups are managed by Supabase and do not require any configuration.

To restore from an automatic backup:
1. Go to your Supabase project dashboard
2. Navigate to Database > Backups
3. Select the backup point you want to restore
4. Click "Restore" — this will restore your entire database to that point in time

**Warning**: Restoring a backup will overwrite all data created after the backup point.

### Manual Point-in-Time Recovery (PITR)

Supabase Pro plans support Point-in-Time Recovery (PITR), which lets you restore to a specific timestamp.

1. Go to Database > Backups > PITR
2. Select a timestamp
3. Create a new project from that recovery point (Supabase creates a new project with the recovered data)

## pg_dump Backup (Self-Managed)

If you want to create your own backups (recommended for any plan), use `pg_dump` with your Supabase database connection string.

### Prerequisites

You need your `SUPABASE_DB_URL` (available in your project `.env` or Supabase dashboard > Settings > Database > Connection string).

### Full Backup

```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  --format=custom \
  --file=shoppilot-backup-$(date +%Y%m%d).dump
```

### Schema-Only Backup

```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  --schema-only \
  --file=shoppilot-schema.sql
```

### Data-Only Backup

```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  --data-only \
  --file=shoppilot-data.sql
```

## Restore

### From a Custom-Format Dump

```bash
pg_restore --dbname="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  --clean --if-exists \
  shoppilot-backup-20260726.dump
```

### From a SQL File

```bash
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -f shoppilot-data.sql
```

## What to Back Up

### Critical Tables (Business Data)

| Table | Contents |
|-------|----------|
| `shops` | Shop profiles and settings |
| `shop_users` | Staff members and roles |
| `customers` | Customer master records |
| `suppliers` | Supplier master records |
| `products` | Product catalog |
| `sales` + `sale_items` | All sales invoices |
| `purchases` + `purchase_items` | All purchase invoices |
| `customer_ledger` | Customer ledger (immutable) |
| `supplier_ledger` | Supplier ledger (immutable) |
| `expenses` | Expense records |
| `sale_returns` + `sale_return_items` | Sale returns |
| `purchase_returns` + `purchase_return_items` | Purchase returns |
| `warranties` + `warranty_claims` | Warranty records |
| `daily_closings` | Daily cash reconciliation |
| `notifications` | In-app notifications |
| `audit_logs` | Audit trail |
| `number_sequences` | Invoice numbering state |

### System Tables

| Table | Contents |
|-------|----------|
| `role_permissions` | Role-to-permission mapping |
| `auth.users` | User accounts (managed by Supabase Auth) |

**Note**: `auth.users` is managed by Supabase and included in Supabase's own backups. If using `pg_dump`, you may need `--schema=public` to exclude auth schema, or include it explicitly.

## Backup Strategy Recommendations

1. **Daily**: Rely on Supabase's automatic backups (Pro plan)
2. **Weekly**: Run `pg_dump` and store the dump file in cloud storage (S3, Google Drive, etc.)
3. **Before migrations**: Always take a manual backup before applying any database migration
4. **Test restores**: Periodically test restoring from a backup to a staging project to verify integrity

## Automated Backup Script

```bash
#!/bin/bash
# backup.sh — Run via cron daily
DB_URL="$1"
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/shoppilot-$DATE.dump"

pg_dump "$DB_URL" --format=custom --file="$FILE"

# Keep only the last 30 days of backups
find "$BACKUP_DIR" -name "shoppilot-*.dump" -mtime +30 -delete

echo "Backup saved: $FILE"
```

Cron entry (runs daily at 2 AM):
```
0 2 * * * /path/to/backup.sh "postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"
```
