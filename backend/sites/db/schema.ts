import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const watcherDevices=sqliteTable('watcher_devices',{
 id:text('id').primaryKey(),guardianId:text('guardian_id').notNull(),name:text('name').notNull(),
 createdAt:integer('created_at').notNull(),pairHash:text('pair_hash'),pairExpires:integer('pair_expires'),
 tokenHash:text('token_hash'),revoked:integer('revoked').notNull().default(0),lastSeen:integer('last_seen'),
 platform:text('platform').notNull().default('unknown'),coverage:text('coverage').notNull().default('{}'),
 policy:text('policy').notNull().default('{"allowedApps":[],"note":"","mode":"advisory"}'),revision:integer('revision').notNull().default(1),
 acknowledgedRevision:integer('acknowledged_revision').notNull().default(0),retentionDays:integer('retention_days').notNull().default(7),
},t=>[index('watcher_guardian_idx').on(t.guardianId),uniqueIndex('watcher_pair_hash_idx').on(t.pairHash)]);
export const watcherEvents=sqliteTable('watcher_events',{
 id:integer('id').primaryKey({autoIncrement:true}),deviceId:text('device_id').notNull().references(()=>watcherDevices.id,{onDelete:'cascade'}),
 packageName:text('package_name').notNull(),timestamp:integer('timestamp').notNull(),
},t=>[uniqueIndex('watcher_event_identity').on(t.deviceId,t.packageName,t.timestamp),index('watcher_event_time').on(t.deviceId,t.timestamp)]);
export const watcherUsage=sqliteTable('watcher_usage',{
 deviceId:text('device_id').notNull().references(()=>watcherDevices.id,{onDelete:'cascade'}),day:text('day').notNull(),
 packageName:text('package_name').notNull(),milliseconds:integer('milliseconds').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[uniqueIndex('watcher_usage_identity').on(t.deviceId,t.day,t.packageName)]);
export const watcherRequests=sqliteTable('watcher_requests',{
 id:text('id').primaryKey(),deviceId:text('device_id').notNull().references(()=>watcherDevices.id,{onDelete:'cascade'}),
 packageName:text('package_name').notNull(),message:text('message').notNull(),status:text('status').notNull().default('pending'),
 createdAt:integer('created_at').notNull(),decidedAt:integer('decided_at'),
},t=>[index('watcher_request_device').on(t.deviceId)]);
