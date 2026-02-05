import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// import './index.css'
// import App from './App.jsx'
import SimpleFaceVerification from './SimpleFaceVerification.jsx'
import FaceVerification from './faceVerifyComponent.jsx'
import SimpleFaceVerify from './VerifyComponent.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SimpleFaceVerify />
  </StrictMode>,
)
