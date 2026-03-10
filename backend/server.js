require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Health check route
app.get('/', (req, res) => {
    res.send("RecipeAI backend running on EC2");
});


// =============================
// Get recipes based on ingredients
// =============================
app.post('/api/get-recipes', async (req, res) => {
    const { ingredients } = req.body;

    if (!ingredients) {
        return res.status(400).json({ error: 'Ingredients are required.' });
    }

    try {
        console.log(`Fetching recipes for: ${ingredients}`);

        const apiUrl = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${ingredients}&number=10&apiKey=${process.env.SPOONACULAR_API_KEY}`;

        const apiResponse = await axios.get(apiUrl);

        if (!apiResponse.data || apiResponse.data.length === 0) {
            return res.status(404).json({ error: 'No recipes found.' });
        }

        const detailedRecipes = await Promise.all(
            apiResponse.data.map(async (recipe) => {
                try {

                    const detailUrl = `https://api.spoonacular.com/recipes/${recipe.id}/information?includeNutrition=true&apiKey=${process.env.SPOONACULAR_API_KEY}`;

                    const detailedResponse = await axios.get(detailUrl);
                    const details = detailedResponse.data;

                    return {
                        title: details.title,
                        image: details.image,
                        isVegetarian: details.vegetarian,
                        rating: (details.spoonacularScore / 20).toFixed(1),

                        nutrition: {
                            calories: details.nutrition?.nutrients?.find(n => n.name === "Calories")?.amount || 'N/A',
                            protein: details.nutrition?.nutrients?.find(n => n.name === "Protein")?.amount || 'N/A',
                            fat: details.nutrition?.nutrients?.find(n => n.name === "Fat")?.amount || 'N/A',
                            carbs: details.nutrition?.nutrients?.find(n => n.name === "Carbohydrates")?.amount || 'N/A'
                        },

                        instructions: details.instructions || "No instructions available."
                    };

                } catch (error) {
                    console.error(`Error fetching details for recipe ${recipe.id}:`, error.response?.data || error.message);
                    return null;
                }
            })
        );

        res.json({
            recipes: detailedRecipes.filter(recipe => recipe !== null)
        });

    } catch (error) {

        console.error('Spoonacular API Error:', error.response?.data || error.message);

        res.status(500).json({
            error: 'Error fetching recipes from Spoonacular.'
        });

    }
});


// =============================
// Generate instructions using OpenAI
// =============================
async function generateInstructions(recipeName) {

    try {

        const openAIResponse = await axios.post(
            'https://api.openai.com/v1/completions',
            {
                model: 'text-davinci-003',
                prompt: `Provide step-by-step cooking instructions for ${recipeName}.`,
                max_tokens: 100,
                temperature: 0.7,
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                }
            }
        );

        return openAIResponse.data.choices[0].text.trim();

    } catch (error) {

        console.error('Error generating instructions:', error);
        return 'No instructions available.';

    }
}


// =============================
// Start Server
// =============================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});