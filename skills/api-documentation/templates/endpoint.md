# Endpoint: [METHOD] /path/to/resource

> One-sentence summary of what this endpoint does.

**Authentication**: <!-- Bearer token / API key / Public -->  
**Rate limit**: <!-- e.g. 100 req/min per token -->

---

## Path parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string (UUID) | Yes | Unique identifier of the resource |

## Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer | 20 | Maximum number of items to return (1–100) |
| `cursor` | string | — | Pagination cursor from a previous response |

## Request body

> Delete this section if the endpoint takes no request body.

**Content-Type**: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name, maximum 128 characters |
| `tags` | string[] | No | List of tags to attach |

### Example

```json
{
  "name": "Example resource",
  "tags": ["tag-a", "tag-b"]
}
```

---

## Responses

| Status | Description |
|--------|-------------|
| `200 OK` | Request succeeded — body contains the resource |
| `201 Created` | Resource was created — `Location` header contains the new URL |
| `400 Bad Request` | Invalid input — see `errors` array |
| `401 Unauthorized` | Authentication missing or invalid |
| `403 Forbidden` | Authenticated but not authorised |
| `404 Not Found` | Resource does not exist |
| `429 Too Many Requests` | Rate limit exceeded — retry after `Retry-After` seconds |

### Success response body

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Example resource",
  "tags": ["tag-a", "tag-b"],
  "createdAt": "2026-04-28T04:00:00Z",
  "updatedAt": "2026-04-28T04:00:00Z"
}
```

### Error response body

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Request body is invalid.",
  "errors": [
    {
      "field": "name",
      "code": "TOO_LONG",
      "message": "Must be 128 characters or fewer."
    }
  ]
}
```

---

## Code examples

### curl

```bash
curl -X POST https://api.example.com/path/to/resource \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example resource","tags":["tag-a"]}'
```

### JavaScript (fetch)

```js
const res = await fetch('https://api.example.com/path/to/resource', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ name: 'Example resource', tags: ['tag-a'] }),
});
const data = await res.json();
```

### Python (httpx)

```python
import httpx

response = httpx.post(
    "https://api.example.com/path/to/resource",
    headers={"Authorization": f"Bearer {token}"},
    json={"name": "Example resource", "tags": ["tag-a"]},
)
response.raise_for_status()
data = response.json()
```
