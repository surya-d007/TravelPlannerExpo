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


const nodemailer = require('nodemailer');

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
  
  



  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  
  const sendMail = (to, subject, text, callback) => {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      text: text
    };
  
    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
        callback(error, null);
      } else {
        console.log('Email sent: ' + info.response);
        callback(null, info.response);
      }
    });
  };



















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
        const response = await axios.get(`http://localhost:80/c/i need Description: , Uniqueness: and Must try: for each ${i-1} place in this ${placesString}`);
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

const generateRandomNumber = () => {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
};


app.post('/api/GenerateReport', async (req, res) => {
  
  
  let tripData = req.body.tripData;
  
  const userId = req.body.userId || "snone";
  console.log("ninde :" + req.body.imgInServer1 + " " + req.body.imgInServer2);
  console.log('nidne    ' + req.body.userEmail );

  try {
    const result = await processTripData(tripData);
    //console.log(JSON.stringify(result, null, 2));
    tripData = result;

    const costEstimation = calculateTotalCost(tripData, 12.5 , 4000, 1000);
    console.log("shdgsfxbvsdfvsdfxcv sbdfvxsdfvsdfvndsfvnsdkfvnkjsdfkjvnkjfsdvknfdksvkfnj");
    console.log(JSON.stringify(costEstimation, null, 2));
    console.log("shdgsfxbvsdfvsdfxcv sbdfvxsdfvsdfvndsfvnsdkfvnkjsdfkjvnkjfsdvknfdksvkfnj");

    const img1 = req.body.imgInServer1 || false;
    const img2 = req.body.imgInServer2 || false;
    const name = `${tripData.tripName}_${req.body.userEmail}_${generateRandomNumber()}`;
    const OutputFileName = `${name}.pdf`;

    app.render('template', {costEstimation , tripData, img1: img1 ? `http://localhost:80/uploads/${img1}` : 'No', img2: img2 ? `http://localhost:80/uploads/${img2}` : 'No' }, async (err, html) => {
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
              { $push: { trips: { tripData, location , costEstimation } } },
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
  
  
  
  

  



  const soll ={
    "tripName": "Samplebs",
    "countryName": "India",
    "date": "2024-07-11T13:15:00.000Z",
    "numNights": 3,
    "numPeople": 6,
    "days": [
      {
        "day": 1,
        "places": [
          {
            "description": "Chennai, Tamil Nadu, India",
            "place_id": "ChIJYTN9T-plUjoRM9RjaAunYW4",
            "distance": {
              "text": "7.5 km",
              "value": 7486
            },
            "about": ": Chennai, formerly known as Madras, is the capital city of the Indian state of Tamil Nadu. It is known for its rich culture, vibrant music and dance scene, and stunning beach resorts.",
            "uniqueness": ": Chennai is famous for its historical landmarks, such as the Kapaleeshwarar Temple, Marina Beach, and Fort St. George. It is also known for its delicious South Indian cuisine, especially idli, dosa, and filter coffee.",
            "mustTry": ": Don't miss trying the authentic Chettinad cuisine at a local restaurant, exploring the bustling markets at T. Nagar, and attending a traditional Bharatanatyam dance performance in Chennai."
          },
          {
            "description": "Ayanavaram, Chennai, Tamil Nadu, India",
            "place_id": "ChIJaWCvBElkUjoRHrLW7UqD34I",
            "distance": {
              "text": "3.6 km",
              "value": 3594
            },
            "about": ": Ayanavaram is a bustling neighborhood in Chennai known for its lively atmosphere and diverse community. It is located in the northern part of the city and is a mix of residential and commercial areas.",
            "uniqueness": ": Ayanavaram is known for its traditional South Indian street food, vibrant street markets, and cultural events. The area has a strong sense of community and is popular among locals for its friendly atmosphere.",
            "mustTry": ": Visit the Ayanavaram market to try local snacks like vada pav and chaat, explore the colorful temples in the area, and attend a traditional music concert at a local venue."
          },
          {
            "description": "Purasawalkam High Road, Purasaiwakkam, Chennai, Tamil Nadu, India",
            "place_id": "EkFQdXJhc2F3YWxrYW0gSGlnaCBSb2FkLCBQdXJhc2Fpd2Fra2FtLCBDaGVubmFpLCBUYW1pbCBOYWR1LCBJbmRpYSIuKiwKFAoSCaU04wzeZVI6EWJYcaL5DtVcEhQKEgkJb4Ch3GVSOhH0K9hahwF-Kw",
            "about": ": Purasaiwakkam is a bustling commercial and residential area in Chennai, known for its shopping streets, vibrant markets, and cultural landmarks. Purasawalkam High Road is a major thoroughfare in the neighborhood.",
            "uniqueness": ": Purasaiwakkam is known for its traditional silk saree shops, antique jewelry stores, and street food vendors serving authentic Tamil cuisine. The area has a mix of old-world charm and modern amenities, making it a popular destination for shoppers and food enthusiasts.",
            "mustTry": ": Explore the bustling streets of Purasaiwakkam to shop for traditional silk sarees, indulge in street food delights like dosa and bajji, and visit the historic Vadapalani temple located nearby."
          }
        ]
      },
      {
        "day": 2,
        "places": [
          {
            "description": "Ooty, Tamil Nadu, India",
            "place_id": "ChIJjdfztYS9qDsRQj8-yRTbmxc",
            "distance": {
              "text": "250 km",
              "value": 250213
            },
            "about": ": Ooty, also known as Udhagamandalam, is a charming hill station located in the Nilgiri Hills of Tamil Nadu. It is famous for its cool climate, beautiful landscapes, and lush tea plantations.",
            "uniqueness": ": Ooty is known for its picturesque lakes like Ooty Lake and Emerald Lake, as well as its stunning botanical gardens and scenic mountain views. The hill station is a popular honeymoon destination and a favorite among nature lovers.",
            "mustTry": ": Take a ride on the Nilgiri Mountain Railway, explore the sprawling Government Botanical Garden, and go boating on the tranquil Ooty Lake for a memorable experience in Ooty."
          },
          {
            "description": "Kodaikanal, Tamil Nadu, India",
            "place_id": "ChIJhwMKf2NmBzsRPMFYNzfp-p8",
            "distance": {
              "text": "290 km",
              "value": 290362
            },
            "about": ": Kodaikanal is a serene hill station located in the Western Ghats of Tamil Nadu. Known for its cool climate, misty hills, and lush forests, Kodaikanal is a popular retreat for travelers seeking relaxation and natural beauty.",
            "uniqueness": ": Kodaikanal is known for its scenic attractions like the Kodaikanal Lake, Coaker's Walk, and Pillar Rocks. The hill station is also famous for its homemade chocolates, eucalyptus oil products, and handicrafts made by local artisans.",
            "mustTry": ": Take a leisurely boat ride on Kodaikanal Lake, hike to Dolphin's Nose for panoramic views of the valley, and try the delicious homemade chocolates at local shops for a sweet treat."
          },
          {
            "description": "Yercaud, Tamil Nadu, India",
            "place_id": "ChIJ69VHRyv0qzsR7ufVRZnNPB0",
            "about": ": Yercaud is a charming hill station nestled in the Eastern Ghats of Tamil Nadu. Known for its pleasant climate, scenic beauty, and tranquil ambiance, Yercaud is a hidden gem for off-the-beaten-path travelers.",
            "uniqueness": ": Yercaud is known for its lush coffee plantations, colorful flower gardens, and panoramic viewpoints offering stunning views of the surrounding valleys. The hill station is a perfect retreat for nature lovers and adventure enthusiasts.",
            "mustTry": ": Visit the Rose Garden to see a variety of exotic flowers, trek to the pristine Killiyur Falls for a refreshing dip, and go on a coffee plantation tour to learn about the local cultivation and processing of coffee in Yercaud."
          }
        ]
      },
      {
        "day": 3,
        "places": [
          {
            "description": "Mumbai, Maharashtra, India",
            "place_id": "ChIJwe1EZjDG5zsRaYxkjY_tpF0",
            "distance": {
              "text": "26.1 km",
              "value": 26085
            },
            "about": ": Mumbai, formerly known as Bombay, is the financial capital of India and a bustling metropolis known for its vibrant culture, diverse cuisine, and iconic landmarks. It is a melting pot of traditions, languages, and lifestyles.",
            "uniqueness": ": Mumbai is known for its historic landmarks like the Gateway of India, Marine Drive, and Elephanta Caves, as well as its vibrant street food scene, bustling markets, and lively nightlife. The city is a hub of entertainment, business, and creative arts.",
            "mustTry": ": Explore the bustling markets of Colaba Causeway and Crawford Market, indulge in street food delights like vada pav and pav bhaji, and catch a Bollywood movie screening at one of Mumbai's iconic theaters for an authentic Mumbai experience."
          },
          {
            "description": "CLUB AQUARIA, LIC Colony, Borivali West, Mumbai, Maharashtra, India",
            "place_id": "ChIJzeJQAyGx5zsRNUl3Gw_5RnI",
            "about": ": Club Aquaria is a premier recreational club located in Borivali West, Mumbai, offering a wide range of facilities and activities for its members. The club is known for its luxurious amenities, family-friendly atmosphere, and entertainment options.",
            "uniqueness": ": Club Aquaria offers top-notch facilities like a swimming pool, gym, spa, sports courts, and restaurants, making it a one-stop destination for fitness, relaxation, and leisure activities. The club organizes events, workshops, and social gatherings for its members.",
            "mustTry": ": Enjoy a relaxing swim in the club's indoor or outdoor pool, workout at the well-equipped gym, pamper yourself with a rejuvenating spa treatment, and dine at the club's restaurant for a memorable experience at Club Aquaria."
          }
        ]
      }
    ]
  };



  const costEstimation2 = {
    "detailedCosts": [
      {
        "day": 1,
        "travelDistance": 21.735,
        "travelCost": 271.6875,
        "numRooms": 3,
        "costPerRoom": 4000,
        "totalAccommodationCost": 12000,
        "foodCostPerPersonPerDay": 1000,
        "foodCost": 5000,
        "costPerKm": 12.5,
        "totalCostForDay": 17271.6875
      },
      {
        "day": 2,
        "travelDistance": 20.194,
        "travelCost": 252.42499999999998,
        "numRooms": 3,
        "costPerRoom": 4000,
        "totalAccommodationCost": 12000,
        "foodCostPerPersonPerDay": 1000,
        "foodCost": 5000,
        "costPerKm": 12.5,
        "totalCostForDay": 17252.425
      },
      {
        "day": 3,
        "travelDistance": 20.194,
        "travelCost": 252.42499999999998,
        "numRooms": 3,
        "costPerRoom": 4000,
        "totalAccommodationCost": 12000,
        "foodCostPerPersonPerDay": 1000,
        "foodCost": 5000,
        "costPerKm": 12.5,
        "totalCostForDay": 17252.425
      }
    ],
    "totalDistance": 62.123,
    "totalTransportationCost": 776.5375,
    "totalAccommodationCost": 36000,
    "totalFoodCost": 15000,
    "totalCost": 51776.5375
  };

  app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.get('/', (req, res) => {

    const img1 = 'sample.jpg' || false;
    const img2 = 'sample.jpg' || false;


    res.render('template', {costEstimation : costEstimation2, tripData: soll, img1: img1 ? `http://localhost:80/uploads/${img1}` : 'No', img2: img2 ? `http://localhost:80/uploads/${img2}` : 'No' });
});


app.get('/generate-pdf', (req, res) => {


  const img1 = 'surya_2_Screenshot_2024-06-28-21-06-21-191_com.whatsapp.jpg' ||false;
  const img2 = 'surya_2_Screenshot_2024-06-28-21-06-21-191_com.whatsapp.jpg' ||false;
  // Render the EJS template to HTML with trip data
  app.render('template', {costEstimation : costEstimation2, tripData: soll, img1: img1 ? `http://localhost:80/uploads/${img1}` : 'No', img2: img2 ? `http://localhost:80/uploads/${img2}` : 'No' }, (err, html) => {
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
      options.height = '1300mm'; // Height of A4

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



app.post('/change-password', async (req, res) => {
  console.log("change-password");
  const { email, newPassword } = req.body;

  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }


    // Validate new password (minimum 8 characters)
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    // Hash new password and update user
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
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

// function calculateTotalCost(data, costPerKm, roomCostPerNight, foodCostPerDayPerPerson) {
//   console.log(JSON.stringify(data, null, 2));
//   let totalDistance = 0;
//   let totalAccommodationCost = 0;
//   let totalFoodCost = 0;

//   console.log("Detailed Cost Breakdown:");

//   data.days.forEach((day, dayIndex) => {
//     let dayDistance = 0;
//     let dayAccommodationCost = 0;
//     let dayFoodCost = 0;

//     day.places.forEach(place => {
//       if (place.distance && place.distance.value) {
//         dayDistance += place.distance.value;
//       }
//     });
//     totalDistance += dayDistance;

//     // Calculate accommodation cost
//     const numRooms = Math.ceil(data.numPeople / 2); // Assuming 2 people per room
//     dayAccommodationCost = roomCostPerNight * numRooms;
//     totalAccommodationCost += dayAccommodationCost;

//     // Calculate food cost
//     dayFoodCost = foodCostPerDayPerPerson * data.numPeople;
//     totalFoodCost += dayFoodCost;

//     console.log(`Day ${dayIndex + 1}:`);
//     console.log(`  Travel Distance: ${dayDistance/1000} meters`);
//     console.log(`  Travel Cost: ${(dayDistance/1000) * costPerKm} (cost per km: ${costPerKm})`);
//     console.log(`  Number of Rooms: ${numRooms}`);
//     console.log(`  Cost per Room: ${roomCostPerNight}`);
//     console.log(`  Total Accommodation Cost for the Day: ${dayAccommodationCost}`);
//     console.log(`  Food Cost for the Day: ${dayFoodCost}`);
//     console.log("");
//   });

//   // Calculate total transportation cost
//   const totalTransportationCost = (totalDistance/1000) * costPerKm;

//   // Calculate total cost
//   const totalCost = totalTransportationCost + totalAccommodationCost + totalFoodCost;

//   // Log total costs
//   console.log("Total Cost Breakdown:");
//   console.log(`  Total Travel Distance: ${totalDistance} meters`);
//   console.log(`  Total Transportation Cost: ${totalTransportationCost}`);
//   console.log(`  Total Accommodation Cost: ${totalAccommodationCost}`);
//   console.log(`  Total Food Cost: ${totalFoodCost}`);
//   console.log(`  Total Overall Cost: ${totalCost}`);

//   return {
//     totalDistance,
//     totalTransportationCost,
//     totalAccommodationCost,
//     totalFoodCost,
//     totalCost
//   };
// }

function calculateTotalCost(data, costPerKm, roomCostPerNight, foodCostPerDayPerPerson) {
  //console.log(JSON.stringify(data, null, 2));
  let totalDistance = 0;
  let totalAccommodationCost = 0;
  let totalFoodCost = 0;
  let detailedCosts = [];

  //console.log("Detailed Cost Breakdown:");

  data.days.forEach((day, dayIndex) => {
    let dayDistance = 0;
    let dayAccommodationCost = 0;
    let dayFoodCost = 0;

    day.places.forEach(place => {
      if (place.distance && place.distance.value) {
        dayDistance += place.distance.value;
      }
    });
    totalDistance += dayDistance;

    // Calculate accommodation cost
    const numRooms = Math.ceil(data.numPeople / 2); // Assuming 2 people per room
    dayAccommodationCost = roomCostPerNight * numRooms;
    totalAccommodationCost += dayAccommodationCost;

    // Calculate food cost
    dayFoodCost = foodCostPerDayPerPerson * data.numPeople;
    totalFoodCost += dayFoodCost;

    // Calculate total cost for the day
    const dayTravelCost = (dayDistance / 1000) * costPerKm; // Convert meters to kilometers
    const totalCostForDay = dayTravelCost + dayAccommodationCost + dayFoodCost;

    // Collect detailed cost information for the day
    const dayCostDetails = {
      day: dayIndex + 1,
      travelDistance: dayDistance / 1000, // Convert meters to kilometers
      travelCost: dayTravelCost,
      numRooms: numRooms,
      costPerRoom: roomCostPerNight,
      totalAccommodationCost: dayAccommodationCost,
      foodCostPerPersonPerDay: foodCostPerDayPerPerson,
      foodCost: dayFoodCost,
      costPerKm: costPerKm,
      totalCostForDay: totalCostForDay
    };
    detailedCosts.push(dayCostDetails);

    // console.log(`Day ${dayIndex + 1}:`);
    // console.log(`  Travel Distance: ${dayCostDetails.travelDistance} kilometers`);
    // console.log(`  Travel Cost: ${dayCostDetails.travelCost} (cost per km: ${costPerKm})`);
    // console.log(`  Number of Rooms: ${dayCostDetails.numRooms}`);
    // console.log(`  Cost per Room: ${dayCostDetails.costPerRoom}`);
    // console.log(`  Total Accommodation Cost for the Day: ${dayCostDetails.totalAccommodationCost}`);
    // console.log(`  Food Cost per Person per Day: ${dayCostDetails.foodCostPerPersonPerDay}`);
    // console.log(`  Food Cost for the Day: ${dayCostDetails.foodCost}`);
    // console.log(`  Total Cost for the Day: ${dayCostDetails.totalCostForDay}`);
    // console.log("");
  });

  // Calculate total transportation cost
  const totalTransportationCost = (totalDistance / 1000) * costPerKm; // Convert meters to kilometers

  // Calculate total cost
  const totalCost = totalTransportationCost + totalAccommodationCost + totalFoodCost;

  // // Log total costs
  // console.log("Total Cost Breakdown:");
  // console.log(`  Total Travel Distance: ${totalDistance / 1000} kilometers`);
  // console.log(`  Total Transportation Cost: ${totalTransportationCost}`);
  // console.log(`  Total Accommodation Cost: ${totalAccommodationCost}`);
  // console.log(`  Total Food Cost: ${totalFoodCost}`);
  // console.log(`  Total Overall Cost: ${totalCost}`);

  // Return detailed cost information and total cost as JSON
  const result = {
    detailedCosts,
    totalDistance: totalDistance / 1000, // Convert meters to kilometers
    totalTransportationCost,
    totalAccommodationCost,
    totalFoodCost,
    totalCost
  };

  console.log("Cost Details JSON:");
  //console.log(JSON.stringify(result, null, 2));

  return result;
}


app.get('/z', (req, res) => {
  console.log("h");
  calculateTotalCost(soll, 12.5 , 4000, 1000);
  res.send('Hi, I am Su     r ya');
  
});





app.post('/send-email', (req, res) => {
  const { to, subject, text } = req.body;

  sendMail(to, subject, text, (error, response) => {
    if (error) {
      res.status(500).send('Error sending email');
    } else {
      res.status(200).send('Email sent successfully');
    }
  });
});

const crypto = require('crypto');
function generateRandomPassword(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}


app.post('/forgot-password',async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Check if user exists
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Generate a random password
  const newPassword = generateRandomPassword(10);
  
  // Hash the new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update the user's password in the database
  user.password = hashedPassword;
  await user.save();


  

  sendMail(email, "ur new password", `youu new pass ${newPassword}`, (error, response) => {
    if (error) {
      res.status(500).send('Error sending email');
    } else {
      res.status(200).send('Email sent successfully');
    }
  });



  // Send email with new password
  console.log(`New password for ${email}: ${newPassword}`);
  // await sendMail(email, 'Your New Password', `Your new password is: ${newPassword}`);

  res.status(200).send('New password sent to your email');
});




const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});
