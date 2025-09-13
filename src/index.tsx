import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { AuthProvider } from "./services/AuthContext";
import "./index.css";
import * as serviceWorker from "./serviceWorker";

console.log('CAMELOTDJ App starting..c.');
const rootElement = document.getElementById("root");
console.log('Root element:', rootElement);

if (rootElement) {
    ReactDOM.render(
        <AuthProvider>
            <App/>
        </AuthProvider>,
        rootElement
    );
    console.log('React app mounted successfully');
} else {
    console.error('Root element not found!');
}

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
