// Using fingerpose gesture definitions
// Thumbs Up
const thumbsUpGesture = new fp.GestureDescription('thumbs_up');
thumbsUpGesture.addCurl(fp.Finger.Thumb, fp.FingerCurl.NoCurl, 1.0);
thumbsUpGesture.addDirection(fp.Finger.Thumb, fp.FingerDirection.VerticalUp, 1.0);
for(let finger of [fp.Finger.Index, fp.Finger.Middle, fp.Finger.Ring, fp.Finger.Pinky]) {
  thumbsUpGesture.addCurl(finger, fp.FingerCurl.FullCurl, 1.0);
  thumbsUpGesture.addDirection(finger, fp.FingerDirection.VerticalUp, 0.9);
}

// Pointing
const pointGesture = new fp.GestureDescription('point');
pointGesture.addCurl(fp.Finger.Index, fp.FingerCurl.NoCurl, 1.0);
pointGesture.addDirection(fp.Finger.Index, fp.FingerDirection.VerticalUp, 0.9);
for(let finger of [fp.Finger.Thumb, fp.Finger.Middle, fp.Finger.Ring, fp.Finger.Pinky]) {
  pointGesture.addCurl(finger, fp.FingerCurl.FullCurl, 1.0);
}

// Open Palm
const openPalmGesture = new fp.GestureDescription('open_palm');
for(let finger of fp.Finger.all) {
  openPalmGesture.addCurl(finger, fp.FingerCurl.NoCurl, 1.0);
}

// Fist
const fistGesture = new fp.GestureDescription('fist');
for(let finger of fp.Finger.all) {
  fistGesture.addCurl(finger, fp.FingerCurl.FullCurl, 1.0);
}

// Peace Sign
const peaceGesture = new fp.GestureDescription('peace');
peaceGesture.addCurl(fp.Finger.Index, fp.FingerCurl.NoCurl, 1.0);
peaceGesture.addCurl(fp.Finger.Middle, fp.FingerCurl.NoCurl, 1.0);
for(let finger of [fp.Finger.Ring, fp.Finger.Pinky, fp.Finger.Thumb]) {
  peaceGesture.addCurl(finger, fp.FingerCurl.FullCurl, 1.0);
}

const knownGestures = [
  thumbsUpGesture,
  pointGesture,
  openPalmGesture,
  fistGesture,
  peaceGesture,
];
