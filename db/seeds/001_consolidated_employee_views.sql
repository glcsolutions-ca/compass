INSERT INTO consolidated_employee_views (employee_id, view_data)
VALUES (
  'employee-123',
  jsonb_build_object(
    'employeeId',
    'employee-123',
    'asOf',
    to_char((NOW() AT TIME ZONE 'utc') - interval '30 seconds', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'freshnessLagSeconds',
    30,
    'sourceSystems',
    jsonb_build_array(
      jsonb_build_object(
        'name',
        'jira',
        'status',
        'healthy',
        'lastSyncedAt',
        to_char(
          (NOW() AT TIME ZONE 'utc') - interval '20 seconds',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      ),
      jsonb_build_object(
        'name',
        'legacy-erp',
        'status',
        'healthy',
        'lastSyncedAt',
        to_char(
          (NOW() AT TIME ZONE 'utc') - interval '35 seconds',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
    ),
    'timeEntries',
    jsonb_build_array(
      jsonb_build_object(
        'id',
        'te-1001',
        'sourceSystem',
        'jira',
        'workPackageId',
        'wp-42',
        'date',
        to_char(NOW() AT TIME ZONE 'utc', 'YYYY-MM-DD'),
        'hours',
        4.5,
        'lastUpdatedAt',
        to_char(
          (NOW() AT TIME ZONE 'utc') - interval '32 seconds',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
    ),
    'workPackages',
    jsonb_build_array(
      jsonb_build_object(
        'id',
        'wp-42',
        'sourceSystem',
        'legacy-erp',
        'name',
        'Migration Sprint A',
        'status',
        'active',
        'assignedAt',
        '2026-02-01T09:00:00.000Z',
        'lastUpdatedAt',
        to_char(
          (NOW() AT TIME ZONE 'utc') - interval '40 seconds',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
    )
  )
),
(
  'employee-admin',
  jsonb_build_object(
    'employeeId',
    'employee-admin',
    'asOf',
    to_char((NOW() AT TIME ZONE 'utc') - interval '30 seconds', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'freshnessLagSeconds',
    30,
    'sourceSystems',
    jsonb_build_array(
      jsonb_build_object(
        'name',
        'jira',
        'status',
        'healthy',
        'lastSyncedAt',
        to_char(
          (NOW() AT TIME ZONE 'utc') - interval '20 seconds',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      ),
      jsonb_build_object(
        'name',
        'legacy-erp',
        'status',
        'healthy',
        'lastSyncedAt',
        to_char(
          (NOW() AT TIME ZONE 'utc') - interval '35 seconds',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
    ),
    'timeEntries',
    jsonb_build_array(
      jsonb_build_object(
        'id',
        'te-2001',
        'sourceSystem',
        'jira',
        'workPackageId',
        'wp-77',
        'date',
        to_char(NOW() AT TIME ZONE 'utc', 'YYYY-MM-DD'),
        'hours',
        3.5,
        'lastUpdatedAt',
        to_char(
          (NOW() AT TIME ZONE 'utc') - interval '32 seconds',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
    ),
    'workPackages',
    jsonb_build_array(
      jsonb_build_object(
        'id',
        'wp-77',
        'sourceSystem',
        'legacy-erp',
        'name',
        'Program Planning',
        'status',
        'active',
        'assignedAt',
        '2026-02-01T09:00:00.000Z',
        'lastUpdatedAt',
        to_char(
          (NOW() AT TIME ZONE 'utc') - interval '40 seconds',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
    )
  )
)
ON CONFLICT (employee_id) DO UPDATE
SET
  view_data = EXCLUDED.view_data,
  updated_at = NOW();
