#!/usr/bin/env node
// Generates the VAPID key pair that identifies this server to push services.
// Run once, then keep the private key secret. Rotating it invalidates every
// existing subscription, so people would have to re-enable notifications.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("Add these to your environment (fly secrets set ...):\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com`);
