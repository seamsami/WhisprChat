# WhisprChat: Real-time Communication Platform

WhisprChat is a modern, secure, and scalable real-time chat application built with Next.js, React, and WebSocket technology.

## Features

- Real-time messaging
- WebSocket-powered communication
- JWT-based authentication
- Responsive design with TailwindCSS
- Secure and performant architecture

## Prerequisites

- Node.js (>= 18.0.0)
- npm or yarn
- A MongoDB database
- Vercel account (optional, for deployment)

## Getting Started

### Development Setup

1. Clone the repository
```bash
git clone https://github.com/yourusername/whispr-chat.git
cd whispr-chat
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Configure environment variables
Copy `.env.example` to `.env` and fill in the required configurations:
```bash
cp .env.example .env
```

4. Run the development server
```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Building for Production

```bash
npm run build
npm start
# or
yarn build
yarn start
```

## Deployment

### Vercel (Recommended)

1. Install Vercel CLI
```bash
npm i -g vercel
```

2. Deploy to Vercel
```bash
# For staging
npm run deploy

# For production
npm run deploy:prod
```

### Other Platforms

Ensure the following environment variables are set:
- `JWT_SECRET`
- `NEXTAUTH_SECRET`
- `DATABASE_URL`
- `NEXT_PUBLIC_WS_URL`

## Development Resources

- [React Documentation](https://react.dev/)
- [TailwindCSS Documentation](https://tailwindcss.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [WebSocket Protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

## Contributing

Please read `CONTRIBUTING.md` for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the `LICENSE.md` file for details.
