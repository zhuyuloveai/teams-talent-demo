# Permissions and security scope

The Owner manages projects, assignment, acceptance and publishing; members prepare context, submit work and deliver results. The two local roles share state, but every write API checks the role, Origin, access token and revision.

Choosing a role in the browser is not enterprise authentication. The local HTTP service listens only on 127.0.0.1; real enterprise login, production authentication, security scanning and payment capabilities are not connected yet. Functional acceptance does not change security=unverified.
