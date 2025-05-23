'use client';
import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import './VideoFadeGenerator.module.css';

export default function VideoFadeGenerator() {
  const [ffmpeg, setFFmpeg] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [image, setImage] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Load FFmpeg
  useEffect(() => {
  const loadFFmpeg = async () => {
    const baseURL = '/ffmpeg';
    const ffmpegInstance = new FFmpeg();
    ffmpegInstance.on('progress', ({ progress }) => {
      setProgress(Math.round(progress * 100));
      console.log('FFmpeg Progress:', progress);
    });
    ffmpegInstance.on('log', ({ message }) => {
      console.log('FFmpeg Log:', message);
    });
    
    try {
      console.log('Attempting to load FFmpeg core from:', `${baseURL}/ffmpeg-core.js`);
      console.log('Attempting to load FFmpeg WASM from:', `${baseURL}/ffmpeg-core.wasm`);
      
      const coreURL = `${baseURL}/ffmpeg-core.js`;
      const wasmURL = `${baseURL}/ffmpeg-core.wasm`;

      console.log('About to load FFmpeg with coreURL:', coreURL, 'wasmURL:', wasmURL);
      await ffmpegInstance.load({
        coreURL,
        wasmURL,
      });
      setFFmpeg(ffmpegInstance);
      setLoaded(true);
      setError(null);
      console.log('FFmpeg loaded successfully from local files');
    } catch (error) {
      console.error('Error loading FFmpeg:', error);
      setError(`Failed to load FFmpeg: ${error.message || 'Unknown error'}. Ensure FFmpeg files are in public/ffmpeg.`);
    }
  };
  loadFFmpeg();
}, []);
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setError('No file selected. Please choose an image.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Invalid file type. Please upload an image (JPEG/PNG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImage(event.target.result);
      setVideoUrl(null);
      setError(null);
    };
    reader.onerror = () => {
      setError('Failed to read the image file. Please try another image.');
    };
    reader.readAsDataURL(file);
  };

  const generateVideo = async () => {
    if (!image || !ffmpeg) {
      setError('No image or FFmpeg not loaded. Please upload an image and try again.');
      return;
    }
    
    setIsGenerating(true);
    setProgress(0);
    setError(null);
    
    try {
      const inputName = `input_${Date.now()}.jpg`;
      const outputName = `output_${Date.now()}.mp4`;
      
      // Fetch image data
      const fileData = await fetchFile(image);
      console.log('Fetched file size:', fileData.byteLength);
      if (fileData.byteLength === 0) {
        throw new Error('Invalid image data: File size is 0.');
      }

      // Write image to FFmpeg file system
      await ffmpeg.writeFile(inputName, fileData);
      console.log('Wrote image to FFmpeg FS:', inputName);

      // Verify file exists in FFmpeg FS
      const files = await ffmpeg.listDir('/');
      console.log('FFmpeg FS contents:', files);

      // Run FFmpeg command
      await ffmpeg.exec([
        '-loop', '1',
        '-i', inputName,
        '-vf', 'fade=t=in:st=0:d=2',
        '-t', '10',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        outputName
      ]);
      console.log('FFmpeg command executed for output:', outputName);

      // Check if output file exists
      const outputExists = (await ffmpeg.listDir('/')).some(file => file.name === outputName);
      if (!outputExists) {
        throw new Error('Output video file not created by FFmpeg.');
      }

      // Read the result
      const data = await ffmpeg.readFile(outputName);
      console.log('Output file size:', data.byteLength);
      if (data.byteLength === 0) {
        throw new Error('Output video is empty.');
      }

      // Clean up FFmpeg file system
      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
        console.log('Cleaned up FFmpeg FS:', inputName, outputName);
      } catch (cleanupError) {
        console.warn('Error cleaning up FFmpeg FS:', cleanupError);
      }

      // Clean up previous video URL
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      
      // Create new video URL
      const blob = new Blob([data], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
    } catch (error) {
      console.error('Error generating video:', error);
      setError(`Failed to generate video: ${error.message || 'Unknown error'}. Please try a different image.`);
    } finally {
      setIsGenerating(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const downloadVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = 'fade-video.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="video-fade-container">
      <h1 className="video-fade-title">Photo-to-Video Fade Generator</h1>
      
      <div className="video-fade-card">
        {!loaded ? (
          <div className="video-fade-loading">
            <p>Loading FFmpeg...</p>
            <progress className="video-fade-progress" max="100" value={progress}></progress>
            {error && <p className="video-fade-error">{error}</p>}
          </div>
        ) : (
          <>
            <div className="video-fade-upload-section">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="video-fade-file-input"
              />
              <button
                onClick={triggerFileInput}
                className="video-fade-upload-btn"
              >
                Upload Photo
              </button>
            </div>
            
            {error && <p className="video-fade-error">{error}</p>}
            
            {image && (
              <div className="video-fade-preview-section">
                <h2 className="video-fade-preview-title">Preview</h2>
                <div className="video-fade-preview-container">
                  <img src={image} alt="Preview" className="video-fade-preview-image" />
                </div>
              </div>
            )}
            
            {image && !videoUrl && (
              <button
                onClick={generateVideo}
                disabled={isGenerating}
                className={`video-fade-generate-btn ${isGenerating ? 'disabled' : ''}`}
              >
                {isGenerating ? `Generating Video... ${progress}%` : 'Generate Video'}
              </button>
            )}
            
            {videoUrl && (
              <div className="video-fade-result-section">
                <h2 className="video-fade-result-title">Generated Video</h2>
                <div className="video-fade-video-container">
                  <video controls className="video-fade-video">
                    <source src={videoUrl} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
                <button
                  onClick={downloadVideo}
                  className="video-fade-download-btn"
                >
                  Download Video
                </button>
              </div>
            )}
          </>
        )}
      </div>
      
      <div className="video-fade-footer">
        <p>The video will fade in for the first 2 seconds and remain visible for 10 seconds total.</p>
      </div>
    </div>
  );
}
