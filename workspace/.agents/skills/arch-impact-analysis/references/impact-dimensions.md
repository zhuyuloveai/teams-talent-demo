# Impact Dimensions and Grading Criteria

## Six impact dimensions

| Dimension | Check points |
|------|---------|
| Code | Modules, classes, files, dependencies |
| Data | Tables, fields, data migration, compatibility |
| Interfaces | Internal/external interfaces, integration partners |
| Configuration | Parameters, configuration items, environment differences |
| Documentation | Design, operations manual, test documents |
| Permissions | Roles, permission points, data access |

## Impact levels

| Level | Definition | Handling |
|------|------|------|
| High | Affects core flows / production data / multiple systems | Dedicated review + rollback drill |
| Medium | Affects a local feature / secondary interface | Review + regression |
| Low | No external impact | Record only |
