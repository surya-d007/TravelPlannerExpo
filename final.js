require('dotenv').config();
const express = require('express');
const { Client } = require('@googlemaps/google-maps-services-js');
const axios = require('axios');
const path = require('path');
const pdf = require('html-pdf');
const multer = require('multer');
const fs = require('fs');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = new S3Client({ region: "ap-south-1" });
const cors = require('cors');




const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('./model/userDataModel'); 


mongoose.connect('mongodb+srv://surya-007:abcd1234@cluster0.e95bgae.mongodb.net/TravelGen?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('MongoDB connected...');
})
.catch(err => {
  console.error('MongoDB connection error:', err);
});




const app = express();
const client = new Client({});
const API_KEY = process.env.MAPS; // Replace with your actual API key



app.use(express.json());
app.use(cors());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.use('/reports', (req, res, next) => {
    res.setHeader('Content-Type', 'application/pdf');
    next();
}, express.static(path.join(__dirname, 'public')));

app.use('/reports', (req, res, next) => {
    res.setHeader('Content-Type', 'application/pdf');
    next();
}, express.static(path.join(__dirname, 'public')));


const uploadFile = async (fileName) => {
  try {
    // Construct the file path
    const filePath = path.join(__dirname, "public", fileName);

    // Read file content
    const fileContent = fs.readFileSync(filePath);

    // Create upload parameters
    const uploadParams = {
      Bucket: "travelpanningreports",
      Key: path.basename(filePath),
      Body: fileContent,
    };

    // Upload file to S3
    const command = new PutObjectCommand(uploadParams);
    const data = await s3Client.send(command);
    console.log("Upload Success", data);

    // Delete the file after successful upload
    fs.unlink(filePath, (err) => {
      if (err) {
        console.log("Error deleting file", err);
        throw err;
      }
      console.log("File deleted successfully");
    });

    return `https://travelpanningreports.s3.ap-south-1.amazonaws.com/${uploadParams.Key}`;
  } catch (err) {
    console.log("Error", err);
    throw err;
  }
};


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = './uploads/';
      // Create 'uploads' directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Extract userId and original filename from request body
      const { userId } = req.body;
      const { originalname } = file;
  
      // Example: ${userId}_2_${originalname}
      const filename = `${originalname}`;
      cb(null, filename); // Use custom filename for the uploaded file
    }
  });



  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 } 
  });


  app.post('/upload', upload.single('imageFile'), (req, res) => {

    const email = req.body.email; // Get the email from form data
    console.log('User email:', email);


    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }
    console.log("hi");
  
    res.send(req.file.filename); // Send back the filename of the uploaded file
  });
  
  















// Function to add distances between places

async function addDistancesToTripData(tripData) {
    for (let day of tripData.days) {
        for (let i = 0; i < day.places.length - 1; i++) {
            const origin = day.places[i].place_id;
            const destination = day.places[i + 1].place_id;

            try {
                const response = await client.distancematrix({
                    params: {
                        origins: [`place_id:${origin}`],
                        destinations: [`place_id:${destination}`],
                        key: API_KEY,
                    },
                });

                const distance = response.data.rows[0].elements[0].distance;
                day.places[i].distance = distance;
            } catch (error) {
                console.error(error);
                day.places[i].distance = { text: 'N/A', value: 0 };
            }
        }
    }
    return tripData;
}

// Function to get additional place details
async function getPlaceDetails(tripData) {
    var i=1;
    let placesString = '';
    for (let day of tripData.days) {
        for (let place of day.places) {
            placesString += ` [${i++} ] ${place.description}, `;
        }
    }


    //placesString = placesString.slice(0, -2); // Remove the trailing comma and space
    console.log(placesString);
    try {
        const response = await axios.get(`http://192.168.29.253:3000/c/i need Description: , Uniqueness: and Must try: for each ${i-1} place in this ${placesString}`);
        console.log(response.data);
        const ans = await transformPlacesData(response.data);
        //console.log("ans :" + ans);
        
        return ans;

        
    } catch (error) {
        console.error(error);
        throw new Error('Error fetching place details');
    }
}

async function transformPlacesData(data){


    const places = data.title.split(/\n(?=\d+\.\s)/); // Split by line that starts with a number followed by a dot and space
    const result = {};

    places.forEach((place, index) => {
        const lines = place.split('\n');
        const placeKey = `place${index + 1}`;

        let description = '';
        let uniqueness = '';
        let mustTry = '';

        lines.forEach(line => {
            if (line.startsWith('Description')) {
                description = line.replace('Description', '');
            } else if (line.startsWith('Uniqueness')) {
                uniqueness = line.replace('Uniqueness', '');
            } else if (line.startsWith('Must try')) {
                mustTry = line.replace('Must try', '');
            } else if (description && !uniqueness && !mustTry) {
                description += ' ' + line.trim();
            } else if (uniqueness && !mustTry) {
                uniqueness += ' ' + line.trim();
            } else if (mustTry) {
                mustTry += ' ' + line.trim();
            }
        });

        result[placeKey] = {
            description: description.trim(),
            uniqueness: uniqueness.trim(),
            mustTry: mustTry.trim()
        };
    });


    return result;
};


function mergeTripDataWithPlaceDetails(tripDetails, placeInfo) {
  var jj=0;
  for (var i = 0; i < tripDetails.days.length; i++) {
    var day = tripDetails.days[i];
    for (var j = 0; j < day.places.length; j++) {
      var place = day.places[j];
      var placeKey = 'place' + (++jj);
      var info = placeInfo[placeKey];
      if (info) {
        place.about = info.description;
        place.uniqueness = info.uniqueness;
        place.mustTry = info.mustTry;
      }
    }
  }
  return tripDetails;
}

// Main function to process the trip data
async function processTripData(tripData) {
    // Add distances to trip data
    const tripDataWithDistances = await addDistancesToTripData(tripData);

    //console.log("dist " + "     " + JSON.stringify(tripDataWithDistances, null, 2))

    // Get additional place details
    const placeDetails = await getPlaceDetails(tripDataWithDistances);

    //console.log("place " + "     " + JSON.stringify(placeDetails, null, 2));

    const mergedTripData = mergeTripDataWithPlaceDetails(tripDataWithDistances, placeDetails);
    // Merge the place details with the trip data

    // for (let day of tripDataWithDistances.days) {
    //     for (let place of day.places) {
    //         const placeDetailKey = Object.keys(placeDetails).find(key => 
    //             placeDetails[key].description.includes(place.description.split(',')[0])
    //         );
    //         if (placeDetailKey) {
    //             place.uniqueness = placeDetails[placeDetailKey].uniqueness;
    //             place.mustTry = placeDetails[placeDetailKey].mustTry;
    //             place.about = placeDetails[placeDetailKey].description;
    //         }
    //     }
    // }

   
  // const finalTripData = {
  //   tripName: tripData.tripName,
  //   countryName: tripData.countryName,
  //   date: tripData.date,
  //   numNights: tripData.numNights,
  //   numPeople: tripData.numPeople,
  //   days: tripData.days.map(day => {
  //     return {
  //       day: day.day,
  //       places: day.places.map((place, index) => {
  //         const details = placeDetails[`place${index + 1}`];
  //         const finalPlace = {
  //           description: place.description,
  //           place_id: place.place_id,
  //           about: details.description,
  //           uniqueness: details.uniqueness,
  //           mustTry: details.mustTry
  //         };
  
  //         if (place.distance) {
  //           finalPlace.distance = place.distance;
  //         }
  
  //         return finalPlace;
  //       })
  //     };
  //   })
  // };



  

  //console.log("final  " + "     " + JSON.stringify(mergedTripData, null, 2));
    return mergedTripData;
}

// app.post('/api/GenerateReport', async (req, res) => {
//     console.log('hi');
//     var tripData = req.body.tripData;
//     const userId = req.body.userId || "snone";
//     console.log("ninde :" + req.body.imgInServer1 + " " + req.body.imgInServer2);

//     try {
//         const result = await processTripData(tripData);
//         console.log( JSON.stringify(result, null, 2));
//         tripData = result;

//         const img1 = req.body.imgInServer1 || false;
//         const img2 = req.body.imgInServer2 || false;
//         // Render the EJS template to HTML with trip data
//           const name = `${userId}_${tripData.tripName}`;
//             const OutputFileName = `${name}.pdf`


//         app.render('template', { tripData , img1: img1 ? `http://192.168.29.253:3000/uploads/${img1}` : 'No', img2: img2 ? `http://192.168.29.253:3000/uploads/${img2}` : 'No'  }, (err, html) => {
//             if (err) {
//               console.log('error1');
//                 res.status(500).send('Error rendering template');
//                 return;
//             }
    
//             // PDF options
//             const options = {
//                 format: 'A4',
//                 border: '0mm',
//             };
    
//             options.width = '210mm'; // Width of A4
//             options.height = '897mm'; // Height of A4


          
            
//             // Generate PDF from HTML
//             await new Promise((resolve, reject) => {
//             pdf.create(html, options).toFile(path.join(__dirname, 'public', OutputFileName), (err, result) => {
//                 if (err) {
//                     console.log('error2');
//                     res.status(500).send('Error generating PDF');
//                     return;
//                 }
//             });}); 
          
//           });


            

//             if (!OutputFileName) {
//               return res.status(400).json({ error: "File name is required" });
//             }
//             try {
//               const location = await uploadFile(OutputFileName);
//               res.status(200).json({ message: "File upload successful", location });
//             } catch (err) {
//               console.log('error3');
//               res.status(500).json({ error: "Error uploading file" });
//             }

        
//     } catch (error) {
//       console.log('error4');
//       console.log(error.message);
//       console.log(error);
//         res.status(500).send(error.message);
//     }
// });

const generateRandomNumber = () => {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
};


app.post('/api/GenerateReport', async (req, res) => {
  
  console.log('hi');
  let tripData = req.body.tripData;
  const userId = req.body.userId || "snone";
  console.log("ninde :" + req.body.imgInServer1 + " " + req.body.imgInServer2);
  console.log('nidne    ' + req.body.userEmail );

  try {
    const result = await processTripData(tripData);
    //console.log(JSON.stringify(result, null, 2));
    tripData = result;

    const img1 = req.body.imgInServer1 || false;
    const img2 = req.body.imgInServer2 || false;
    const name = `${tripData.tripName}_${req.body.userEmail}_${generateRandomNumber()}`;
    const OutputFileName = `${name}.pdf`;

    app.render('template', { tripData, img1: img1 ? `http://192.168.29.253:3000/uploads/${img1}` : 'No', img2: img2 ? `http://192.168.29.253:3000/uploads/${img2}` : 'No' }, async (err, html) => {
      if (err) {
        console.log('error1');
        return res.status(500).send('Error rendering template');
      }

  

      const options = {
        format: 'A4',
        border: '0mm',
    };

    options.width = '210mm'; // Width of A4
    options.height = '897mm'; // Height of A4

      try {
        await new Promise((resolve, reject) => {
          pdf.create(html, options).toFile(path.join(__dirname, 'public', OutputFileName), (err, result) => {
            if (err) {
              return reject(err);
            }
            resolve(result);
          });
        });

        if (!OutputFileName) {
          return res.status(400).json({ error: "File name is required" });
        }

        try {
          const location = await uploadFile(OutputFileName);


          const email = req.body.userEmail;
          if (email) {
            const user = await User.findOneAndUpdate(
              { email },
              { $push: { trips: { tripData, location } } },
              { new: true }
            );
            if (!user) {
              return res.status(404).json({ error: 'User not found' });
            }
          }
  


          res.status(200).json({ message: "File upload successful", location });
        } catch (err) {
          console.log('error3');
          res.status(500).json({ error: "Error uploading file" });
        }

      } catch (err) {
        console.log('error2');
        res.status(500).send('Error generating PDF');
      }
      finally{


        try{
        var filePath = path.join(__dirname, 'uploads', img1);

        // Check if the file exists
        if (fs.existsSync(filePath)) {
          // Delete the file
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error("Error deleting file", err);
            }
            console.log(`Deleted file: ${filePath}`);
            
          });
        } else {
          console.log("file not found img1")
        }
      }catch(error)
          {
            console.log('error 1 img');      
          }



        try{
        filePath = path.join(__dirname, 'uploads', img2);

        // Check if the file exists
        if (fs.existsSync(filePath)) {
          // Delete the file
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error("Error deleting file", err);
            }
            console.log(`Deleted file: ${filePath}`);
            
          });
        } else {
          console.log("file not found img2")
        }
      }catch(error)
      {
        console.log('error2  img ');
      }



      }
    });

  } catch (error) {
    console.log('error4');
    console.log(error.message);
    console.log(error);
    res.status(500).send(error.message);
  }
});


const openai = new OpenAI({
    apiKey: process.env.CHATGPT
  });
  const genAI = new GoogleGenerativeAI(process.env.GEMINI);
  
  // Define a function to generate chat completions
  async function generateChatCompletion(question) {
    try {
        const chatCompletion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "user", content: question }
            ]
        });
        return chatCompletion.choices[0].message.content;
    } catch (error) {
        console.error("Error generating chat completion:", error);
        return "Error generating chat completion";
    }
  }
  
  async function generateContent(question) {
    try {
        // For text-only input, use the gemini-pro model
        const model = genAI.getGenerativeModel({ model: "gemini-pro"});
        const result = await model.generateContent(question);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error generating content:", error);
        return "Error generating content";
    }
  }
  
  
  // Define a route to handle requests for '/c/:question'
  app.get('/c/:question', async (req, res) => {
    try {
        const question = req.params.question;
        const title = await generateChatCompletion(question);
        // Send the generated title as JSON response
        res.json({ title });
    } catch (error) {
        console.error("Error handling '/c' request:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
  
  app.get('/g/:question', async (req, res) => {
    try {
        const question = req.params.question;
        const content = await generateContent(question);
        // Send the generated content as JSON response
        res.json({ content });
    } catch (error) {
        console.error("Error handling '/g' request:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
  
  
  

  



  const soll = {
    "tripName": "Chennai trip",
    "countryName": "India",
    "date": "2024-07-12T04:20:00.000Z",
    "numNights": 3,
    "numPeople": 5,
    "days": [
      {
        "day": 1,
        "places": [
          {
            "description": "Perambur, Chennai, Tamil Nadu, India",
            "place_id": "ChIJm6CRQgVlUjoR00h7rxzlbyc",
            "distance": {
              "text": "21.7 km",
              "value": 21732
            },
            "uniqueness": "Perambur is home to the Perambur Loco Works, one of the oldest and largest railway workshops in India.",
            "mustTry": "Visit Perambur Market for some authentic South Indian street food and shop for traditional sarees and jewelry at the local shops.",
            "about": "Perambur is a bustling residential and commercial area in Chennai, known for its vibrant markets, historic buildings, and diverse culinary scene."
          },
          {
            "description": "ICF Chennai Charter Chapter, 2nd Street, Sri Sakthi Vijayalakshmi Nagar, Gangai Nagar, Velachery, Chennai, Tamil Nadu, India",
            "place_id": "ChIJq6o2aYldUjoRZpp9UWU7w-I",
            "uniqueness": "The center hosts regular events, workshops, and performances, promoting local talent and fostering a sense of community spirit.",
            "mustTry": "Attend a cultural event or workshop at the ICF Chennai Charter Chapter to experience the vibrant arts and culture scene in Velachery.",
            "about": "The ICF Chennai Charter Chapter is a popular community center in Velachery, offering a range of cultural and recreational activities for residents."
          }
        ]
      },
      {
        "day": 2,
        "places": [
          {
            "description": "VIT Chennai, Kelambakkam - Vandalur Road, Rajan Nagar, Chennai, Tamil Nadu, India",
            "place_id": "ChIJZx9Jjq9ZUjoRLX11GxNCS5Q",
            "distance": {
              "text": "12.9 km",
              "value": 12942
            },
            "uniqueness": "The campus boasts state-of-the-art labs, research centers, and recreational facilities, providing students with a holistic learning experience.",
            "mustTry": "Take a campus tour of VIT Chennai to explore the modern infrastructure, lush greenery, and vibrant student life.",
            "about": "VIT Chennai is a prestigious educational institution known for its world-class facilities and quality education in various fields."
          },
          {
            "description": "Vandalur, Tamil Nadu, India",
            "place_id": "ChIJy7t0xgn2UjoRM_bhnwg2rB8",
            "distance": {
              "text": "7.3 km",
              "value": 7252
            },
            "uniqueness": "Vandalur is known for its rich cultural heritage, ancient temples, and natural beauty, making it a popular destination for nature lovers and history enthusiasts.",
            "mustTry": "Visit the Arignar Anna Zoological Park in Vandalur to see a diverse range of wildlife species, including endangered and rare animals.",
            "about": "Vandalur is a historic town in Tamil Nadu, home to the Arignar Anna Zoological Park, one of the largest zoos in South Asia."
          },
          {
            "description": "Tambaram, Chennai, Tamil Nadu, India",
            "place_id": "ChIJD61KhBRfUjoR1DjOxGY6beE",
            "uniqueness": "Tambaram is a major transportation hub, with a busy railway station and bus terminus connecting the neighborhood to other parts of the city.",
            "mustTry": "Explore Tambaram Market for some authentic South Indian street food, shop for traditional silk sarees at the local stores, and visit the Tambaram Air Force Station for a unique aviation experience.",
            "about": "Tambaram is a bustling suburban neighborhood in Chennai, known for its vibrant markets, shopping malls, and recreational centers."
          }
        ]
      },
      {
        "day": 3,
        "places": [
          {
            "description": "VIT Chennai, Kelambakkam - Vandalur Road, Rajan Nagar, Chennai, Tamil Nadu, India",
            "place_id": "ChIJZx9Jjq9ZUjoRLX11GxNCS5Q",
            "distance": {
              "text": "12.9 km",
              "value": 12942
            },
            "uniqueness": "The campus boasts state-of-the-art labs, research centers, and recreational facilities, providing students with a holistic learning experience.",
            "mustTry": "Take a campus tour of VIT Chennai to explore the modern infrastructure, lush greenery, and vibrant student life.",
            "about": "VIT Chennai is a prestigious educational institution known for its world-class facilities and quality education in various fields."
          },
          {
            "description": "Vandalur, Tamil Nadu, India",
            "place_id": "ChIJy7t0xgn2UjoRM_bhnwg2rB8",
            "distance": {
              "text": "7.3 km",
              "value": 7252
            },
            "uniqueness": "Vandalur is known for its rich cultural heritage, ancient temples, and natural beauty, making it a popular destination for nature lovers and history enthusiasts.",
            "mustTry": "Visit the Arignar Anna Zoological Park in Vandalur to see a diverse range of wildlife species, including endangered and rare animals.",
            "about": "Vandalur is a historic town in Tamil Nadu, home to the Arignar Anna Zoological Park, one of the largest zoos in South Asia."
          },
          {
            "description": "Tambaram, Chennai, Tamil Nadu, India",
            "place_id": "ChIJD61KhBRfUjoR1DjOxGY6beE",
            "uniqueness": "Tambaram is a major transportation hub, with a busy railway station and bus terminus connecting the neighborhood to other parts of the city.",
            "mustTry": "Explore Tambaram Market for some authentic South Indian street food, shop for traditional silk sarees at the local stores, and visit the Tambaram Air Force Station for a unique aviation experience.",
            "about": "Tambaram is a bustling suburban neighborhood in Chennai, known for its vibrant markets, shopping malls, and recreational centers."
          }
        ]
      }
    ]
  };



  app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.get('/', (req, res) => {

    const img1 = 'sample.jpg' || false;
    const img2 = 'sample.jpg' || false;


    res.render('template', { tripData: soll, img1: img1 ? `http://192.168.29.253:3000/uploads/${img1}` : 'No', img2: img2 ? `http://192.168.29.253:3000/uploads/${img2}` : 'No' });
});


app.get('/generate-pdf', (req, res) => {


    const img1 = 'surya  (5).png' ||false;
    const img2 = 'undefined_2__1_Screenshot_2024-06-28-16-24-37-008_com.google.android.gm.jpg' ||false;
    // Render the EJS template to HTML with trip data
    app.render('template', { tripData: soll, img1: img1 ? `http://192.168.29.253:3000/uploads/${img1}` : 'No', img2: img2 ? `http://192.168.29.253:3000/uploads/${img2}` : 'No' }, (err, html) => {
        if (err) {
            res.status(500).send('Error rendering template');
            return;
        }

        // PDF options
        const options = {
            format: 'A4',
            border: '0mm',
        };

        options.width = '210mm'; // Width of A4
        options.height = '897mm'; // Height of A4

        // Generate PDF from HTML
        pdf.create(html, options).toFile('./output.pdf', (err, result) => {
            if (err) {
                res.status(500).send('Error generating PDF');
                return;
            }

            // Respond to client with PDF file
            res.sendFile(path.join(__dirname, 'output.pdf'));
        });
    });
});

















app.post('/register', async (req, res) => {
  console.log("reg");
  const { email, password } = req.body;

  try {
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new user with hashed password
    const hashedPassword = await bcrypt.hash(password, 10);
    user = new User({ email, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
// Assuming this is part of your /login endpoint
app.post('/login', async (req, res) => {
  console.log("log");
  const { email, password } = req.body;

  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Passwords match, generate JWT token or set session etc.
    res.status(200).json({ message: 'Login successful' });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/checkV', async (req, res) => {
  console.log("log");
  const { email } = req.body;
  

  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Passwords match, generate JWT token or set session etc.
    res.status(200).json({ message: 'Login successful' });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});





app.post('/getUserData', async (req, res) => {
  const { email } = req.body;
  console.log(email);

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});




app.get('/z', (req, res) => {
  console.log("h");
  res.send('Hi, I am Su     r ya');
});



const PORT = process.env.PORT || 3000;
app.listen(PORT,'192.168.29.253', () => {
    console.log(`Server is running on port http://192.168.29.253:${PORT}`);
});
