// scripts/firebase.js

import firebase from 'firebase/app';
import 'firebase/database';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
    databaseURL: 'https://YOUR_PROJECT_ID.firebaseio.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT_ID.appspot.com',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_APP_ID'
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Database reference
const database = firebase.database();

export const getData = (path) => {
    return database.ref(path).once('value').then((snapshot) => {
        return snapshot.val();
    });
};

export const setData = (path, data) => {
    return database.ref(path).set(data);
};

export const updateData = (path, data) => {
    return database.ref(path).update(data);
};

export const deleteData = (path) => {
    return database.ref(path).remove();
};
