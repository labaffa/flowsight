# Fews2Board

## How to run Fews2Board

### Environment variables

The app needs some mandatory environment variables:
* **PG_HOST**: {host}:{port} of the postgres database
* **PG_DATABASE**: the name of the database
* **PG_SCHEMA_NAME**: the name of the postgres schema inside the **PG_DATABASE**
* **PG_USER** and **PG_PASSWORD**: user's credentials

### Docker

Open a terminal in the root directory of the repository and build the Docker image:

```bash
docker build -t <image-name> .
```

If you place env variables on an `.env` file, start the application using the following command:

```bash
docker run --env-file .env -p 8000:8000 -it <image-name>
```
