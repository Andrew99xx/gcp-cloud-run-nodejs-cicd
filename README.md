## Secure User Service

This repository contains a secure, JWT-based user authentication microservice built with Node.js/Express, containerized with Docker, and deployed to Google Cloud Run. Continuous integration and deployment is automated via GitHub Actions with Workload Identity Federation—no long-lived keys needed.

---

### Table of Contents

* [Features](#features)
* [Architecture](#architecture)
* [Prerequisites](#prerequisites)
* [Local Development](#local-development)
* [Google Cloud Setup](#google-cloud-setup)

  * [1. Enable APIs](#1-enable-apis)
  * [2. Create Service Account](#2-create-service-account)
  * [3. Create Artifact Registry Repo](#3-create-artifact-registry-repo)
  * [4. Create Secret for JWT\_SECRET](#4-create-secret-for-jwt_secret)
  * [5. OIDC setup](#5-optional-terraform)
* [CI/CD with GitHub Actions](#cicd-with-github-actions)
* [Manual Deployment](#manual-deployment)
* [API Reference](#api-reference)
* [License](#license)

---

## Features

* **JWT-based auth** with bcrypt-hashed passwords
* **Express** endpoints: `/register`, `/login`, `/profile`
* **Docker** multi-stage build on `node:18-alpine`, non-root user
* **Cloud Run** deployment, autoscaled (1–3 instances)
* **Secret Manager** for `JWT_SECRET`
* **Workload Identity Federation** via GitHub Actions (OIDC)
* **GitHub Actions** pipeline for build → push → deploy

---

## Architecture

1. **Client** issues HTTP requests to Cloud Run service
2. **Express API** handles registration/login, issues JWTs
3. **In-memory store** holds users (for demo; replace with cloud DB in prod)
4. **Secret Manager** holds `JWT_SECRET`, injected at runtime
5. **Cloud Run** runs container, autoscaling managed via annotations
6. **GitHub Actions** authenticates with GCP via OIDC, builds & pushes Docker, deploys to Cloud Run

---

## Prerequisites

* Node.js ≥ 18
* Docker
* `gcloud` CLI configured and authenticated
* A GCP project with billing enabled
* GitHub repo with these secrets configured:

  * `GCP_PROJECT_NUMBER` (numeric)
  * `WORKLOAD_ID_POOL` (e.g. `my-pool`)
  * `WORKLOAD_ID_PROVIDER` (e.g. `github-provider`)

---

## Local Development

1. **Clone**

   ```bash
   git clone git@github.com:Andrew99xx/user-service.git
   cd user-service
   ```

2. **Environment**
   Create a `.env` with:

   ```
   JWT_SECRET=your_super_secret_key
   ```

3. **Install & Run**

   ```bash
   npm install
   npm start
   ```

   Service listens on port 8080 by default.

4. **Test Endpoints**

   ```bash
   # Register
   curl -X POST http://localhost:8080/register \
     -H "Content-Type: application/json" \
     -d '{"email":"alice@example.com","password":"password"}'

   # Login
   curl -X POST http://localhost:8080/login \
     -H "Content-Type: application/json" \
     -d '{"email":"alice@example.com","password":"password"}'

   # Profile (replace TOKEN)
   curl http://localhost:8080/profile \
     -H "Authorization: Bearer TOKEN"
   ```

---

## Google Cloud Setup

### 1. Enable APIs

```bash
gcloud services enable run.googleapis.com \
                         artifactregistry.googleapis.com \
                         secretmanager.googleapis.com
```

### 2. Create Service Account

```bash
gcloud iam service-accounts create user-service-run-sa \
  --display-name="Cloud Run SA"
```

Grant it needed roles:

```bash
PROJECT=your-project-id
SA=user-service-run-sa@$PROJECT.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$SA" \
  --role=roles/run.admin

gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$SA" \
  --role=roles/iam.serviceAccountUser

gcloud artifacts repositories add-iam-policy-binding user-service-repo \
  --project=$PROJECT --location=us-central1 \
  --member="serviceAccount:$SA" \
  --role=roles/artifactregistry.writer

gcloud secrets add-iam-policy-binding jwt-secret \
  --project=$PROJECT \
  --member="serviceAccount:$SA" \
  --role=roles/secretmanager.secretAccessor
```

### 3. Create Artifact Registry Repo

```bash
gcloud artifacts repositories create user-service-repo \
  --repository-format=docker \
  --location=us-central1 \
  --description="Docker repo for user-service"
```

### 4. Create Secret for JWT\_SECRET

```bash
echo -n "your_super_secret_key" | \
  gcloud secrets create jwt-secret --data-file=-
```


### 5. Configure Workload Identity Federation

This lets GitHub Actions authenticate to GCP without long-lived keys.

1. **Create a Workload Identity Pool**

   ```bash
   gcloud iam workload-identity-pools create "my-pool" \
     --project="${PROJECT_ID}" \
     --location="global" \
     --display-name="GitHub Actions Pool"
   ```

2. **Create a GitHub OIDC Provider in that Pool**

   ```bash
   gcloud iam workload-identity-pools providers create-oidc "github-provider" \
     --project="${PROJECT_ID}" \
     --location="global" \
     --workload-identity-pool="my-pool" \
     --display-name="GitHub Actions Provider" \
     --issuer-uri="https://token.actions.githubusercontent.com" \
     --allowed-audiences="https://token.actions.githubusercontent.com","projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/my-pool/providers/github-provider" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
     --attribute-condition="assertion.repository_owner=='<YOUR_GITHUB_USERNAME_CASE_SENSITIVE>'"
   ```

3. **Bind GitHub’s OIDC Identities to Your Service Account**

   ```bash
   SA="user-service-run-sa@${PROJECT_ID}.iam.gserviceaccount.com"
   POOL="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/my-pool"
   PROVIDER="${POOL}/providers/github-provider"

   # Allow GitHub repos under your owner to impersonate the SA
   gcloud iam service-accounts add-iam-policy-binding "$SA" \
     --role="roles/iam.workloadIdentityUser" \
     --member="principalSet://${PROVIDER}/attribute.repository_owner/<YOUR_GITHUB_USERNAME_CASE_SENSITIVE>"

   # Allow those principals to mint tokens for the SA
   gcloud iam service-accounts add-iam-policy-binding "$SA" \
     --role="roles/iam.serviceAccountTokenCreator" \
     --member="principalSet://${PROVIDER}/attribute.repository_owner/<YOUR_GITHUB_USERNAME_CASE_SENSITIVE>"
   ```

4. **Store These IDs as GitHub Secrets**

   In your GitHub repo settings, add three new Secrets:

   | Name                   | Value                                                                                                           |
   | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
   | `GCP_PROJECT_NUMBER`   | Your project’s numeric ID (e.g. output of `gcloud projects describe $PROJECT_ID --format=value(projectNumber)`) |
   | `WORKLOAD_ID_POOL`     | `my-pool`                                                                                                       |
   | `WORKLOAD_ID_PROVIDER` | `github-provider`                                                                                               |

Once that’s in place, the workflow’s auth step will look like:

```yaml
- uses: google-github-actions/auth@v1
  with:
    workload_identity_provider: projects/${{ secrets.GCP_PROJECT_NUMBER }}/locations/global/workloadIdentityPools/${{ secrets.WORKLOAD_ID_POOL }}/providers/${{ secrets.WORKLOAD_ID_PROVIDER }}
    service_account: user-service-run-sa@${{ env.PROJECT_ID }}.iam.gserviceaccount.com
```

## CI/CD with GitHub Actions

The workflow `.github/workflows/deploy.yml` runs on push to `main`:

1. **Checkout code**
2. **Authenticate** via `google-github-actions/auth@v1` (OIDC → Workload Identity)
3. **Install gcloud** (`setup-gcloud@v2`)
4. **Configure Docker** for Artifact Registry
5. **Build & push** container tagged with `${{ github.sha }}`
6. **Deploy** to Cloud Run via `deploy-cloudrun@v1` (autoscaling, secrets, labels)

Make sure your repo **Secrets** include:

* `GCP_PROJECT_NUMBER`
* `WORKLOAD_ID_POOL`
* `WORKLOAD_ID_PROVIDER`

Once merged, every commit to `main` is live in Cloud Run within \~2 minutes.

---

## Manual Deployment

If you need to do a one-off deploy manually:

```bash
# Build & push
IMAGE="us-central1-docker.pkg.dev/$PROJECT/user-service-repo/user-service:latest"
docker build -t $IMAGE .
docker push $IMAGE

# Deploy
gcloud run deploy user-service \
  --image $IMAGE \
  --region us-central1 \
  --service-account user-service-run-sa@$PROJECT.iam.gserviceaccount.com \
  --set-env-vars JWT_SECRET_SECRET=projects/$PROJECT/secrets/jwt-secret \
  --min-instances=1 --max-instances=3 \
  --allow-unauthenticated
```

---

## API Reference

| Endpoint    | Method | Description                                                              |
| ----------- | ------ | ------------------------------------------------------------------------ |
| `/register` | POST   | Accepts `{ email, password }`, registers user (bcrypt + in-mem)          |
| `/login`    | POST   | Accepts `{ email, password }`, returns `{ token }` if valid              |
| `/profile`  | GET    | Protected; requires `Authorization: Bearer <token>`, returns `{ email }` |

### Example Requests

```bash
# Register
curl -X POST https://<CLOUD_RUN_URL>/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password"}'

# Login
curl -X POST https://<CLOUD_RUN_URL>/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password"}'

# Profile
curl https://<CLOUD_RUN_URL>/profile \
  -H "Authorization: Bearer <JWT_TOKEN>"

# Query
curl https://<CLOUD_RUN_URL>/query \
  -H "Authorization: Bearer <JWT_TOKEN>"
```
---

## 🔗 Live Demo

You can try out the deployed service here:

**Production URL:**  
https://user-service-1094759251296.us-central1.run.app/

---

## License

This project is released under the **MIT License**.
